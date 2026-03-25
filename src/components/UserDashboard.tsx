
import React, { useState, useEffect } from 'react';
import { QuizResult, User, QuizConfig, GradeLevel, DEFAULT_CONTENT_CATEGORIES } from '../types';
import { useUserResults, useQuizConfigs } from '../hooks/useData';
import { getSystemSetting, getUserResults } from '../services/storageService';
import { Button } from './Button';

import { UserRole } from '../types';

import { getPaginationItems, DOTS } from '../utils/pagination';

interface UserDashboardProps {
  user: User;
  onStartQuiz: (configId?: string) => void;
  onLogout: () => void;
  onViewResult: (result: QuizResult) => void;
}

const GRADE_LEVEL_MAP: Record<string, GradeLevel> = {
  '小学': GradeLevel.PRIMARY,
  '初中': GradeLevel.JUNIOR,
  '高中': GradeLevel.SENIOR,
  '综合': GradeLevel.COMPREHENSIVE
};

export const UserDashboard: React.FC<UserDashboardProps> = ({ user, onStartQuiz, onViewResult }) => {
  // Tabs State
  const [activeTab, setActiveTab] = useState<'selection' | 'records'>('selection');

  // History Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Config State
  const [configSearchTerm, setConfigSearchTerm] = useState('');
  const [contentCategoryOptions, setContentCategoryOptions] = useState<string[]>(DEFAULT_CONTENT_CATEGORIES);
  const [completedQuizIds, setCompletedQuizIds] = useState<string[]>([]);

  // SWR Hooks
  const { configs: allConfigs, isLoading: isConfigsLoading } = useQuizConfigs();
  const { results: history, total: totalHistory, isLoading: isHistoryLoading } = useUserResults(user.id, currentPage, itemsPerPage);

  // Fetch attempted quizzes
  useEffect(() => {
    const fetchCompleted = async () => {
        try {
            // Note: This fetches all history to determine completion status. 
            // In a large scale app, we might want a dedicated lightweight endpoint.
            // But getUserResults is already available.
            const results = await getUserResults(user.id);
            
            const completedIds: string[] = [];
            
            if (allConfigs && allConfigs.length > 0) {
                 const configMap = new Map(allConfigs.map(c => [c.id, c]));
                 
                 results.forEach(r => {
                     if (r.configId) {
                         const config = configMap.get(r.configId);
                         if (config) {
                             const cutoff = config.lastResetAt && config.lastResetAt > 0
                               ? (config.lastResetAt <= Date.now() ? config.lastResetAt : 0)
                                : 0;
                             if (r.timestamp > cutoff) {
                                 completedIds.push(r.configId);
                             }
                         } else {
                             completedIds.push(r.configId);
                         }
                     }
                 });
                 setCompletedQuizIds([...new Set(completedIds)]);
            }
        } catch (error) {
            console.error('Failed to fetch user history for completion status', error);
        }
    };
    
    if (allConfigs && allConfigs.length > 0) {
        fetchCompleted();
    }
  }, [user.id, history, allConfigs]); // Re-run when history or configs change

  // Fetch dynamic categories
  useEffect(() => {
      const loadContentCategories = async () => {
          const raw = await getSystemSetting('question_content_categories');
          if (!raw) {
              setContentCategoryOptions(DEFAULT_CONTENT_CATEGORIES);
              return;
          }
          try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                  const values = parsed.filter(v => typeof v === 'string') as string[];
                  setContentCategoryOptions(values.length > 0 ? values : DEFAULT_CONTENT_CATEGORIES);
                  return;
              }
          } catch {
          }
          setContentCategoryOptions(DEFAULT_CONTENT_CATEGORIES);
      };
      loadContentCategories();
  }, []);

  // Filter configs based on user role and subject/grade matching
  const filteredConfigs = React.useMemo(() => {
      if (!allConfigs) return [];
      let filtered = allConfigs;
      
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
          // 1. Must be published
          filtered = filtered.filter(c => c.isPublished);

          // 2. Subject & Grade Matching
          filtered = filtered.filter(c => {
             const userSubjects = user.subject || [];
             const configSubjects = c.subjects || [];
             
             // Subject Filter: If config has subjects restriction, user must have at least one matching subject
             // If config has no subjects restriction, anyone can see it
             const hasSubjectMatch = configSubjects.length === 0 || 
                                   (userSubjects.length > 0 && userSubjects.some(s => configSubjects.includes(s)));
             
             const userStages = user.schoolStage || [];
             const configGrades = c.gradeLevels || [];
             
             // Grade Filter: If config has grade restriction, user must have at least one matching stage
             // If config has no grade restriction, anyone can see it
             const hasGradeMatch = configGrades.length === 0 || 
                                 (userStages.length > 0 && userStages.some(stage => {
                                     const mapped = GRADE_LEVEL_MAP[stage];
                                     return mapped && configGrades.includes(mapped);
                                 }));

             return hasSubjectMatch && hasGradeMatch;
          });
      }
      return filtered;
  }, [allConfigs, user.role, user.subject, user.schoolStage]);

  // Group configs by category
  const categorizedConfigs = React.useMemo(() => {
      // Apply search filter first
      const searchFiltered = filteredConfigs.filter(c => 
        (c.name || '').toLowerCase().includes(configSearchTerm.toLowerCase()) || 
        (c.description || '').toLowerCase().includes(configSearchTerm.toLowerCase())
      );

      const grouped: Record<string, QuizConfig[]> = {};
      
      // Initialize with available categories
      contentCategoryOptions.forEach(cat => {
          grouped[cat] = [];
      });
      grouped['其他'] = [];

      searchFiltered.forEach(config => {
          let placed = false;
          if (config.contentCategories && config.contentCategories.length > 0) {
              config.contentCategories.forEach(cat => {
                  if (grouped[cat]) {
                      grouped[cat].push(config);
                      placed = true;
                  }
              });
          }
          
          if (!placed) {
              // If no category matched or no category present, put in '其他'
              // Note: If a config has categories but none are in our options list (e.g. deleted category), put in '其他'
              // But we only want to put it in '其他' ONCE, even if multiple invalid categories.
              // Logic above: if ANY valid category found, placed=true.
              // So only if NO valid category found, put in Other.
              // Logic check: if config has NO categories, placed is false.
              // if config has categories but none match, placed is false.
              // Correct.
              grouped['其他'].push(config);
          }
      });
      
      return grouped;
  }, [filteredConfigs, configSearchTerm, contentCategoryOptions]);

  const isInitialLoading = isConfigsLoading;

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return '-';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  };

  const getPartScores = (result: QuizResult) => {
    if (!result.configId || filteredConfigs.length === 0) return null;
    
    const config = filteredConfigs.find(c => c.id === result.configId);
    if (!config || !config.parts) return null;

    let currentAttemptIdx = 0;
    return config.parts.map((part, idx) => {
        if (currentAttemptIdx >= result.attempts.length) return null;

        const partAttempts = result.attempts.slice(currentAttemptIdx, currentAttemptIdx + part.count);
        currentAttemptIdx += part.count;
        
        const score = partAttempts.reduce((sum, a) => sum + (a?.score || 0), 0);
        const total = partAttempts.reduce((sum, a) => sum + (a?.maxScore || 0), 0);
        
        return (
            <span key={idx} className="inline-block mr-4 text-xs text-gray-500">
                {part.name}: <span className="font-medium text-gray-700">{Math.round(score * 10) / 10}</span> / {total}
            </span>
        );
    });
  };

  if (isInitialLoading) {
      return <div className="p-20 text-center text-gray-500">加载数据中...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-10">
      
      {/* Header & Tabs */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
         <div className="flex flex-col md:flex-row items-center justify-between mb-6">
             <div className="flex items-center mb-4 md:mb-0">
                <div className="w-14 h-14 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center text-2xl mr-4 shadow-inner">
                    👋
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">欢迎回来, {user.username}</h1>
                    <p className="text-sm text-gray-500">准备好开始今天的挑战了吗？</p>
                </div>
             </div>
             <div className="flex p-1 bg-gray-100 rounded-xl">
                 <button
                    onClick={() => setActiveTab('selection')}
                    className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === 'selection' 
                        ? 'bg-white text-primary-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                 >
                    选择试卷
                 </button>
                 <button
                    onClick={() => setActiveTab('records')}
                    className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === 'records' 
                        ? 'bg-white text-primary-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                 >
                    我的记录
                 </button>
             </div>
         </div>
      </div>

      {/* Quiz Selection Tab */}
      {activeTab === 'selection' && (
          <div className="space-y-8">
              {/* Search Bar */}
              <div className="relative max-w-md mx-auto">
                <input
                    type="text"
                    placeholder="搜索试卷名称或描述..."
                    value={configSearchTerm}
                    onChange={(e) => setConfigSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm text-sm transition-all bg-white/80 backdrop-blur"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-4 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
             </div>

             {filteredConfigs.length === 0 ? (
                 <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
                     <div className="text-4xl mb-4">📭</div>
                     <h3 className="text-lg font-medium text-gray-900">暂无可用试卷</h3>
                     <p className="text-gray-500 mt-2">当前没有匹配您学科和学段的试卷，请联系管理员。</p>
                 </div>
             ) : (
                 <div className="space-y-10">
                     {[...contentCategoryOptions, '其他'].map(category => {
                         const categoryConfigs = categorizedConfigs[category];
                         if (!categoryConfigs || categoryConfigs.length === 0) return null;

                         return (
                             <div key={category} className="animate-fade-in">
                                 <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4 px-2">
                                     <span className="w-1 h-6 bg-primary-500 rounded-full mr-3"></span>
                                     {category}
                                     <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{categoryConfigs.length}</span>
                                 </h2>
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                     {categoryConfigs.map(config => {
                                         const isCompleted = completedQuizIds.includes(config.id);
                                         const isLocked = config.allowOneAttempt && isCompleted;
                                         
                                         return (
                                         <div key={`${category}-${config.id}`} className={`group bg-white border border-gray-200 rounded-xl p-5 hover:shadow-lg hover:border-primary-200 transition-all flex flex-col relative overflow-hidden h-full ${isLocked ? 'opacity-75 grayscale-[0.5]' : ''}`}>
                                             <div className="flex justify-between items-start mb-3">
                                                 <div className="bg-primary-50 text-primary-700 text-xs font-bold px-2 py-1 rounded-md">
                                                     {config.totalQuestions} 题
                                                 </div>
                                                 <div className="flex gap-1">
                                                     {config.allowOneAttempt && (
                                                         <div className={`text-xs font-bold px-2 py-1 rounded-md ${isCompleted ? 'bg-gray-100 text-gray-500' : 'bg-orange-50 text-orange-600'}`}>
                                                             {isCompleted ? '已完成' : '仅一次'}
                                                         </div>
                                                     )}
                                                     {config.quizMode === 'exam' && (
                                                         <div className="bg-red-50 text-red-600 text-xs font-bold px-2 py-1 rounded-md">
                                                             考试模式
                                                         </div>
                                                     )}
                                                 </div>
                                             </div>
                                             
                                             <h3 className="font-bold text-gray-800 text-base mb-2 line-clamp-2 min-h-[3rem]" title={config.name}>
                                                 {config.name}
                                             </h3>
                                             
                                             <p className="text-xs text-gray-500 flex-1 mb-4 line-clamp-3 min-h-[2.5rem]">
                                                 {config.description || '暂无描述'}
                                             </p>
                                             
                                             <div className="mt-auto pt-4 border-t border-gray-50">
                                                 <Button 
                                                    onClick={() => !isLocked && onStartQuiz(config.id)} 
                                                    className={`w-full justify-center py-2 text-sm shadow-sm transition-colors ${isLocked ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed hover:bg-gray-100' : 'group-hover:bg-primary-700'}`}
                                                    disabled={isLocked}
                                                    variant={isLocked ? 'secondary' : 'primary'}
                                                 >
                                                     {isLocked ? '无法继续作答' : '开始答题'}
                                                 </Button>
                                             </div>
                                         </div>
                                     )})}
                                 </div>
                             </div>
                         );
                     })}
                     
                     {/* Show empty state if search returns nothing */}
                     {Object.values(categorizedConfigs).every(arr => arr.length === 0) && (
                         <div className="text-center py-12">
                             <p className="text-lg text-gray-500">未找到匹配 "{configSearchTerm}" 的试卷</p>
                         </div>
                     )}
                 </div>
             )}
          </div>
      )}

      {/* History Tab */}
      {activeTab === 'records' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h3 className="font-bold text-gray-800">我的答题记录</h3>
                <span className="bg-white px-3 py-1 rounded-full text-xs text-gray-500 border border-gray-200 shadow-sm">共 {totalHistory} 次挑战</span>
            </div>
            
            {isHistoryLoading ? (
                 <div className="p-16 text-center text-gray-500">
                    <svg className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    加载记录中...
                 </div>
            ) : history.length === 0 ? (
              <div className="p-16 text-center text-gray-500 flex flex-col items-center">
                 <div className="bg-gray-100 p-4 rounded-full mb-4 text-2xl">📝</div>
                 <p className="text-gray-600 font-medium">暂无答题记录</p>
                 <p className="text-sm text-gray-400 mt-1">快去选择试卷开始挑战吧！</p>
                 <Button onClick={() => setActiveTab('selection')} variant="secondary" className="mt-4">去答题</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-semibold">试卷信息</th>
                        <th className="px-6 py-4 font-semibold">提交时间</th>
                        <th className="px-6 py-4 font-semibold">耗时</th>
                        <th className="px-6 py-4 font-semibold">得分</th>
                        <th className="px-6 py-4 font-semibold">状态</th>
                        <th className="px-6 py-4 font-semibold text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                       {history.map((result) => (
                          <React.Fragment key={result.id}>
                            <tr className="hover:bg-primary-50/30 transition-colors group">
                              <td className="px-6 py-4">
                                 <div className="text-sm font-bold text-gray-900">
                                    {result.configName || '未命名试卷'}
                                 </div>
                                 <div className="text-xs text-gray-500 mt-0.5">
                                    共 {result.totalQuestions} 题
                                 </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                 <div className="flex flex-col">
                                     <span>{new Date(result.timestamp).toLocaleDateString()}</span>
                                     <span className="text-xs text-gray-400">{new Date(result.timestamp).toLocaleTimeString()}</span>
                                 </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                                 {formatDuration(result.duration)}
                              </td>
                              <td className="px-6 py-4">
                                 {result.status === 'pending_grading' ? (
                                     <span className="text-orange-500 font-bold text-sm">--</span>
                                 ) : (
                                     <div className="flex items-baseline gap-1">
                                        <span className="text-lg font-bold text-gray-900">{result.score}</span>
                                        <span className="text-xs text-gray-400">/ {result.maxScore || result.totalQuestions}</span>
                                     </div>
                                 )}
                              </td>
                              <td className="px-6 py-4">
                                 {result.status === 'pending_grading' ? (
                                     <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                                         <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5"></span>
                                         等待批改
                                     </span>
                                 ) : result.isPassed !== undefined ? (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                          result.isPassed 
                                          ? 'bg-green-50 text-green-700 border-green-200' 
                                          : 'bg-red-50 text-red-700 border-red-200'
                                      }`}>
                                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${result.isPassed ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                          {result.isPassed ? '合格' : '不合格'}
                                      </span>
                                  ) : (
                                      <span className="text-gray-400 text-xs">-</span>
                                  )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                 <button 
                                    onClick={() => {
                                        const config = filteredConfigs.find(c => c.id === result.configId);
                                        onViewResult({ ...result }); // Don't inject config here, just pass result. ViewResult should handle it or fetch it.
                                    }}
                                    className="text-primary-600 hover:text-primary-800 text-sm font-medium hover:underline opacity-80 group-hover:opacity-100 transition-opacity"
                                 >
                                    查看详情
                                 </button>
                              </td>
                            </tr>
                            {/* Second line for Part Scores */}
                            {(result.attempts && result.attempts.length > 0) && (
                                <tr className="bg-gray-50/20 border-b border-gray-100">
                                    <td colSpan={6} className="px-6 py-2 pb-3">
                                        <div className="flex flex-wrap gap-3 pl-4 border-l-2 border-primary-200">
                                            {getPartScores(result) || <span className="text-xs text-gray-400">暂无分项详情</span>}
                                        </div>
                                    </td>
                                </tr>
                            )}
                          </React.Fragment>
                       ))}
                    </tbody>
                 </table>
                 
                 {/* Pagination Controls */}
                 {Math.ceil(totalHistory / itemsPerPage) > 1 && (
                     <div className="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between bg-white gap-4">
                         <div className="text-sm text-gray-500">
                             显示 {((currentPage - 1) * itemsPerPage) + 1} 到 {Math.min(currentPage * itemsPerPage, totalHistory)} 条，共 {totalHistory} 条
                         </div>
                         <div className="flex space-x-2">
                             <Button 
                                 variant="secondary" 
                                 size="sm"
                                 disabled={currentPage === 1}
                                 onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                             >
                                 上一页
                             </Button>
                             {getPaginationItems(currentPage, Math.ceil(totalHistory / itemsPerPage)).map((page, index) => {
                                 if (page === DOTS) {
                                     return <span key={`dots-${index}`} className="px-2 py-1 text-gray-400">...</span>;
                                 }
                                 return (
                                     <button
                                         key={page}
                                         onClick={() => setCurrentPage(Number(page))}
                                         className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                             currentPage === page
                                                 ? 'bg-primary-600 text-white shadow-sm'
                                                 : 'text-gray-600 hover:bg-gray-200'
                                         }`}
                                     >
                                         {page}
                                     </button>
                                 );
                             })}
                             <Button 
                                 variant="secondary" 
                                 size="sm"
                                 disabled={currentPage === Math.ceil(totalHistory / itemsPerPage)}
                                 onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalHistory / itemsPerPage), prev + 1))}
                             >
                                 下一页
                             </Button>
                         </div>
                     </div>
                 )}
              </div>
            )}
          </div>
      )}
    </div>
  );
};
