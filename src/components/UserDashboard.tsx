
import React, { useState, useEffect } from 'react';
import { QuizResult, User, QuizConfig } from '../types';
import { useUserResults, useQuizConfigs } from '../hooks/useData';
import { Button } from './Button';

import { UserRole } from '../types';

interface UserDashboardProps {
  user: User;
  onStartQuiz: (configId?: string) => void;
  onViewResult: (result: QuizResult) => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({ user, onStartQuiz, onViewResult }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Config Pagination
  const [currentConfigPage, setCurrentConfigPage] = useState(1);
  const configItemsPerPage = 6;
  const [configSearchTerm, setConfigSearchTerm] = useState('');

  // SWR Hooks
  const { configs: allConfigs, isLoading: isConfigsLoading } = useQuizConfigs();
  const { results: history, total: totalHistory, isLoading: isHistoryLoading } = useUserResults(user.id, currentPage, itemsPerPage);

  // Filter configs based on user role
  const configs = React.useMemo(() => {
      if (!allConfigs) return [];
      let filtered = allConfigs;
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
          filtered = filtered.filter(c => c.isPublished);
      }
      return filtered;
  }, [allConfigs, user.role]);

  const isInitialLoading = isConfigsLoading;



  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return '-';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  };

  const getPartScores = (result: QuizResult) => {
    if (!result.configId || configs.length === 0) return null;
    
    const config = configs.find(c => c.id === result.configId);
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

  // Config Pagination Logic
  const filteredConfigs = React.useMemo(() => {
    return configs.filter(c => 
        (c.name || '').toLowerCase().includes(configSearchTerm.toLowerCase()) || 
        (c.description || '').toLowerCase().includes(configSearchTerm.toLowerCase())
    );
  }, [configs, configSearchTerm]);

  const visibleConfigs = filteredConfigs.slice(
      (currentConfigPage - 1) * configItemsPerPage,
      currentConfigPage * configItemsPerPage
  );
  const totalConfigPages = Math.ceil(filteredConfigs.length / configItemsPerPage);

  // Reset page when search changes
  useEffect(() => {
    setCurrentConfigPage(1);
  }, [configSearchTerm]);

  if (isInitialLoading) {
      return <div className="p-20 text-center text-gray-500">加载数据中...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      
      {/* Welcome Section */}
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
         <div className="flex flex-col md:flex-row items-center justify-between mb-6">
             <div className="flex items-center mb-4 md:mb-0">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center text-3xl mr-4">
                    👋
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">欢迎回来, {user.username}!</h1>
                    <p className="text-gray-500">请选择一套试卷开始挑战</p>
                </div>
             </div>
             <div className="relative w-full md:w-64">
                <input
                    type="text"
                    placeholder="搜索试卷..."
                    value={configSearchTerm}
                    onChange={(e) => setConfigSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
             </div>
         </div>

         {/* Exam Cards Grid */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
             {configs.length === 0 ? (
                 <div className="col-span-full text-center py-8 bg-gray-50 rounded-xl text-gray-500">
                     暂无可用试卷，请联系管理员配置。
                 </div>
             ) : filteredConfigs.length === 0 ? (
                 <div className="col-span-full text-center py-12 bg-gray-50 rounded-xl text-gray-500">
                     <p className="text-lg mb-2">🔍</p>
                     未找到匹配 "{configSearchTerm}" 的试卷
                 </div>
             ) : (
                 visibleConfigs.map(config => (
                     <div key={config.id} className="group bg-white border border-gray-200 rounded-xl p-5 hover:shadow-lg hover:border-primary-300 transition-all flex flex-col relative overflow-hidden">
                         <div className="absolute top-0 right-0 bg-primary-50 px-2 py-1 rounded-bl-lg text-xs font-bold text-primary-600">
                             {config.totalQuestions} 题
                         </div>
                         <h3 className="font-bold text-gray-800 text-lg mb-2 pr-8 line-clamp-1">{config.name}</h3>
                         <p className="text-sm text-gray-500 flex-1 mb-4 line-clamp-2 min-h-[40px]">
                             {config.description || '暂无描述'}
                         </p>
                         <Button onClick={() => onStartQuiz(config.id)} className="w-full justify-center group-hover:bg-primary-700">
                             开始答题
                         </Button>
                     </div>
                 ))
             )}
         </div>

         {/* Config Pagination Controls */}
         {totalConfigPages > 1 && (
             <div className="flex justify-center items-center space-x-2 pb-4">
                <Button 
                    variant="secondary" 
                    size="sm"
                    disabled={currentConfigPage === 1}
                    onClick={() => setCurrentConfigPage(prev => Math.max(1, prev - 1))}
                >
                    上一页
                </Button>
                <span className="text-sm text-gray-500">
                    第 {currentConfigPage} / {totalConfigPages} 页
                </span>
                <Button 
                    variant="secondary" 
                    size="sm"
                    disabled={currentConfigPage === totalConfigPages}
                    onClick={() => setCurrentConfigPage(prev => Math.min(totalConfigPages, prev + 1))}
                >
                    下一页
                </Button>
             </div>
         )}
      </div>

      {/* History Section */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-800 text-lg">答题历史记录</h3>
            <span className="bg-white px-3 py-1 rounded-full text-xs text-gray-500 border">共 {totalHistory} 次挑战</span>
        </div>
        
        {isHistoryLoading ? (
             <div className="p-10 text-center text-gray-500">
                加载历史记录中...
             </div>
        ) : history.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
             暂无答题记录，快去选择试卷开始挑战吧！
          </div>
        ) : (
          <div className="overflow-x-auto">
             <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3 font-medium">试卷 / 题目</th>
                    <th className="px-6 py-3 font-medium">时间</th>
                    <th className="px-6 py-3 font-medium">耗时</th>
                    <th className="px-6 py-3 font-medium">得分</th>
                    <th className="px-6 py-3 font-medium">状态</th>
                    <th className="px-6 py-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                   {history.map((result) => (
                      <React.Fragment key={result.id}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                             <div className="text-sm font-medium text-gray-900">
                                {result.configName || '未命名试卷'}
                             </div>
                             <div className="text-xs text-gray-500">
                                共 {result.totalQuestions} 题
                             </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                             {new Date(result.timestamp).toLocaleString('zh-CN')}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                             {formatDuration(result.duration)}
                          </td>
                          <td className="px-6 py-4">
                             {result.status === 'pending_grading' ? (
                                 <span className="text-orange-500 font-bold">批改中</span>
                             ) : (
                                 <>
                                    <span className="font-bold text-gray-900">{result.score}</span>
                                    <span className="text-gray-400 text-xs ml-1">/ {result.maxScore || result.totalQuestions}</span>
                                 </>
                             )}
                          </td>
                          <td className="px-6 py-4">
                             {result.status === 'pending_grading' ? (
                                 <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                     等待批改
                                 </span>
                             ) : result.isPassed !== undefined ? (
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      result.isPassed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                  }`}>
                                      {result.isPassed ? '合格' : '不合格'}
                                  </span>
                              ) : (
                                  <span className="text-gray-400 text-xs">-</span>
                              )}
                          </td>
                          <td className="px-6 py-4 text-right">
                             <button 
                                onClick={() => {
                                    const config = configs.find(c => c.id === result.configId);
                                    onViewResult({ ...result, config });
                                }}
                                className="text-primary-600 hover:text-primary-800 text-sm font-medium hover:underline"
                             >
                                查看详情 &rarr;
                             </button>
                          </td>
                        </tr>
                        {/* Second line for Part Scores */}
                        <tr className="bg-gray-50/50 border-b border-gray-100">
                            <td colSpan={6} className="px-6 py-2 pb-4">
                                <div className="flex flex-wrap gap-2 pl-4 border-l-2 border-primary-200">
                                    {getPartScores(result) || <span className="text-xs text-gray-400">无分项详情</span>}
                                </div>
                            </td>
                        </tr>
                      </React.Fragment>
                   ))}
                </tbody>
             </table>
             
             {/* Pagination Controls */}
             {Math.ceil(totalHistory / itemsPerPage) > 1 && (
                 <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
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
                         {Array.from({ length: Math.ceil(totalHistory / itemsPerPage) }, (_, i) => i + 1).map(page => (
                             <button
                                 key={page}
                                 onClick={() => setCurrentPage(page)}
                                 className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                     currentPage === page
                                         ? 'bg-primary-600 text-white shadow-sm'
                                         : 'text-gray-600 hover:bg-gray-200'
                                 }`}
                             >
                                 {page}
                             </button>
                         ))}
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
    </div>
  );
};
