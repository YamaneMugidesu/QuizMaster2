
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Question, QuestionType, Difficulty, GradeLevel, QuestionFormData, UserRole, QuizResult, User, SUBJECTS, QuizConfig, QuestionCategory } from '../types';
import { saveQuestion, updateQuestion, deleteQuestion, toggleQuestionVisibility, deleteQuizResult, restoreQuestion, hardDeleteQuestion, getQuestionById, getResultById } from '../services/storageService';
import { useQuestions, useQuizConfigs, useAllResults, mutateQuestions, mutateQuizConfigs, mutateResults, mutateUsers } from '../hooks/useData';
import { Button } from './Button';
import { QuestionForm } from './QuestionForm';
import { UserManagement } from './UserManagement';
import { QuizConfigForm } from './QuizConfigForm';
import { ImageWithPreview } from './ImageWithPreview';
import { GradingModal } from './GradingModal';
import { RichTextPreview } from './RichTextPreview';
import { useToast } from './Toast';
import { sanitizeHTML } from '../utils/sanitize';
import SystemMonitor from './SystemMonitor';

interface ExpandableQuestionContentProps {
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}

const ExpandableQuestionContent: React.FC<ExpandableQuestionContentProps> = ({ content, isExpanded, onToggle }) => {
  const textRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      const el = textRef.current;
      if (el && !isExpanded) {
        setIsOverflowing(el.scrollHeight > el.clientHeight + 1);
      }
    };

    checkOverflow();
    // Add a small delay to ensure rendering is complete
    const timer = setTimeout(checkOverflow, 100);
    
    window.addEventListener('resize', checkOverflow);
    return () => {
        window.removeEventListener('resize', checkOverflow);
        clearTimeout(timer);
    };
  }, [content, isExpanded]);

  return (
    <div className="relative group">
        <div 
            ref={textRef}
            className={`transition-all duration-200 ${isExpanded ? '' : 'line-clamp-2 max-h-[4.5em] overflow-hidden'} ${isOverflowing || isExpanded ? 'cursor-pointer' : ''}`}
            onClick={() => {
                if (isOverflowing || isExpanded) {
                    onToggle();
                }
            }}
            title={isExpanded ? "点击收起" : (isOverflowing ? "点击展开全文" : "")}
        >
            <RichTextPreview 
                content={content} 
                className={`text-lg font-medium text-gray-900 ${isExpanded ? '' : 'rich-text-content-inline'}`}
            />
        </div>
        {(isOverflowing || isExpanded) && (
            <button 
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                className="text-xs text-primary-600 hover:text-primary-800 mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                {isExpanded ? (
                    <>
                        收起
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </>
                ) : (
                    <>
                        展开全文
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </>
                )}
            </button>
        )}
    </div>
  );
};

interface AdminDashboardProps {
  currentUser: User;
  onViewResult: (result: QuizResult) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser, onViewResult }) => {
  const { addToast } = useToast();
  // Tabs
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'records' | 'config' | 'users' | 'monitor'>('list');
  
  // --- QUESTIONS STATE ---
  const [currentQuestionPage, setCurrentQuestionPage] = useState(1);
  const questionsPerPage = 10;
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Debounced Filter State
  const [debouncedFilters, setDebouncedFilters] = useState({
      search: '',
      subject: '',
      grade: '',
      type: '',
      difficulty: '',
      category: ''
  });

  // Unified Debounce for all filters
  useEffect(() => {
      const timer = setTimeout(() => {
          setDebouncedFilters({
              search: searchTerm,
              subject: filterSubject,
              grade: filterGrade,
              type: filterType,
              difficulty: filterDifficulty,
              category: filterCategory
          });
      }, 300);
      return () => clearTimeout(timer);
  }, [searchTerm, filterSubject, filterGrade, filterType, filterDifficulty, filterCategory]);

  // Use SWR Hook for Questions
  const { 
      questions, 
      total: totalQuestions, 
      isLoading: isQuestionsLoading 
  } = useQuestions(currentQuestionPage, questionsPerPage, {
      search: debouncedFilters.search,
      subject: debouncedFilters.subject,
      gradeLevel: debouncedFilters.grade as GradeLevel,
      type: debouncedFilters.type as QuestionType,
      difficulty: debouncedFilters.difficulty as Difficulty,
      category: debouncedFilters.category as QuestionCategory,
      isDeleted: showRecycleBin
  }, activeTab === 'list' || activeTab === 'create'); // Only fetch when in question list or create (create might need duplicate check but strictly list is main consumer)

  // --- RECORDS STATE ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [debouncedUserSearchTerm, setDebouncedUserSearchTerm] = useState('');

  // Debounce User Search
  useEffect(() => {
      const timer = setTimeout(() => setDebouncedUserSearchTerm(userSearchTerm), 300);
      return () => clearTimeout(timer);
  }, [userSearchTerm]);

  // Use SWR Hook for Results
  const {
      results: userResults,
      total: totalUserResults,
      isLoading: isResultsLoading
  } = useAllResults(currentPage, itemsPerPage, debouncedUserSearchTerm, activeTab === 'records');

  // --- CONFIGS STATE ---
  const { configs: quizConfigs } = useQuizConfigs(activeTab === 'config' || activeTab === 'records'); // Records tab needs configs for names if not snapshotted (though we fixed that, still safe)

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentQuestionPage(1);
  }, [debouncedFilters]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedUserSearchTerm]);

  // --- MODAL STATES ---
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<string>>(new Set());

  const toggleExpandQuestion = (id: string) => {
      setExpandedQuestionIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) {
              next.delete(id);
          } else {
              next.add(id);
          }
          return next;
      });
  };
  
  // Delete Confirmation Modal State
  const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Grading Modal State
  const [gradingResult, setGradingResult] = useState<QuizResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCreate = async (data: QuestionFormData) => {
    setIsProcessing(true);
    const newQ: Question = {
      id: Math.random().toString(36).substr(2, 9),
      type: data.type,
      text: data.text,
      imageUrls: data.imageUrls,
      options: data.options,
      correctAnswer: data.correctAnswer,
      subject: data.subject,
      difficulty: data.difficulty,
      gradeLevel: data.gradeLevel,
      category: data.category,
      needsGrading: data.needsGrading,
      explanation: data.explanation,
      createdAt: Date.now(),
      isDisabled: false
    };
    try {
      await saveQuestion(newQ);
      mutateQuestions();
      setActiveTab('list');
      addToast('题目创建成功', 'success');
    } catch (error) {
      console.error('Failed to create question:', error);
      addToast('创建题目失败，请重试', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveAndContinue = async (data: QuestionFormData) => {
    setIsProcessing(true);
    const newQ: Question = {
      id: Math.random().toString(36).substr(2, 9),
      type: data.type,
      text: data.text,
      imageUrls: data.imageUrls,
      options: data.options,
      correctAnswer: data.correctAnswer,
      subject: data.subject,
      difficulty: data.difficulty,
      gradeLevel: data.gradeLevel,
      category: data.category,
      needsGrading: data.needsGrading,
      explanation: data.explanation,
      createdAt: Date.now(),
      isDisabled: false
    };
    try {
      await saveQuestion(newQ);
      mutateQuestions();
      addToast('题目已保存，请继续添加下一题', 'success');
    } catch (error) {
      console.error('Failed to create question:', error);
      addToast('创建题目失败，请重试', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdate = async (data: QuestionFormData) => {
    if (!editingQuestion) return;
    setIsProcessing(true);
    
    const updatedQ: Question = {
      ...editingQuestion,
      type: data.type,
      text: data.text,
      imageUrls: data.imageUrls,
      options: data.options,
      correctAnswer: data.correctAnswer,
      subject: data.subject,
      difficulty: data.difficulty,
      gradeLevel: data.gradeLevel,
      category: data.category,
      needsGrading: data.needsGrading,
      explanation: data.explanation
    };
    
    try {
      await updateQuestion(updatedQ);
      mutateQuestions();
      setEditingQuestion(null);
      addToast('题目更新成功', 'success');
    } catch (error) {
      console.error('Failed to update question:', error);
      addToast('更新题目失败，请重试', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditClick = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setProcessingId(id);
    try {
        const fullQuestion = await getQuestionById(id);
        if (fullQuestion) {
            setEditingQuestion(fullQuestion);
        } else {
            addToast('无法加载题目详情', 'error');
        }
    } catch (error) {
        console.error('Failed to load question details:', error);
        addToast('加载失败', 'error');
    } finally {
        setProcessingId(null);
    }
  };

  const initiateDelete = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setQuestionToDelete(id);
  };

  const confirmDelete = async () => {
    if (questionToDelete) {
      setIsProcessing(true);
      try {
        await deleteQuestion(questionToDelete);
        mutateQuestions();
        addToast('题目已删除', 'success');
      } catch (error) {
        console.error('Failed to delete question:', error);
        addToast('删除题目失败', 'error');
      } finally {
        setIsProcessing(false);
      }
      setQuestionToDelete(null);
    }
  };

  const handleToggleDisable = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsProcessing(true);
    try {
      await toggleQuestionVisibility(id);
      mutateQuestions();
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
      addToast('操作失败', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetFilters = () => {
      setSearchTerm('');
      setFilterSubject('');
      setFilterGrade('');
      setFilterType('');
      setFilterDifficulty('');
      setFilterCategory('');
  };

  const getTypeLabel = (t: QuestionType) => {
    switch(t) {
        case QuestionType.MULTIPLE_CHOICE: return '单选题';
        case QuestionType.MULTIPLE_SELECT: return '多选题';
        case QuestionType.TRUE_FALSE: return '判断题';
        case QuestionType.SHORT_ANSWER: return '简答题';
        case QuestionType.FILL_IN_THE_BLANK: return '填空题';
        default: return t;
    }
  };
  
  const confirmDeleteRecord = async () => {
      if (recordToDelete) {
          setIsProcessing(true);
          try {
              await deleteQuizResult(recordToDelete);
              mutateResults();
              addToast('记录已删除', 'success');
          } catch (error) {
              console.error('Failed to delete record:', error);
              addToast('删除记录失败', 'error');
          } finally {
              setIsProcessing(false);
          }
          setRecordToDelete(null);
      }
  };

  const getDifficultyColor = (diff: Difficulty) => {
      switch(diff) {
          case Difficulty.EASY: return 'bg-green-100 text-green-800';
          case Difficulty.MEDIUM: return 'bg-yellow-100 text-yellow-800';
          case Difficulty.HARD: return 'bg-red-100 text-red-800';
          default: return 'bg-gray-100 text-gray-800';
      }
  };

  const getGradeLabel = (g: GradeLevel) => {
      switch(g) {
          case GradeLevel.PRIMARY: return '小学';
          case GradeLevel.JUNIOR: return '初中';
          case GradeLevel.SENIOR: return '高中';
          default: return '小学';
      }
  }

  const getCategoryColor = (c?: QuestionCategory) => {
      switch(c) {
          case QuestionCategory.MISTAKE: return 'bg-red-100 text-red-800 border-red-200';
          case QuestionCategory.EXPLANATION: return 'bg-blue-100 text-blue-800 border-blue-200';
          case QuestionCategory.STANDARD: return 'bg-green-100 text-green-800 border-green-200';
          case QuestionCategory.BASIC: 
          default: return 'bg-gray-100 text-gray-800 border-gray-200';
      }
  };

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return '-';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  };

  const getPartScores = (result: QuizResult) => {
    // If attempts are not loaded (for performance), we can't show part scores
    if (!result.attempts || result.attempts.length === 0) {
        return null;
    }

    if (!result.configId || quizConfigs.length === 0) return null;
    
    const config = quizConfigs.find(c => c.id === result.configId);
    if (!config || !config.parts) return null;

    let currentAttemptIdx = 0;
    return config.parts.map((part, idx) => {
        // Safety check: ensure we don't slice out of bounds
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

  const handleViewResultDetail = async (e: React.MouseEvent, result: QuizResult) => {
      e.stopPropagation();
      setProcessingId(result.id);
      try {
          // If attempts are missing, fetch full result
          let fullResult = result;
          if (!result.attempts || result.attempts.length === 0) {
              const fetched = await getResultById(result.id);
              if (fetched) {
                  fullResult = fetched;
              } else {
                  addToast('无法加载答题详情', 'error');
                  return;
              }
          }
          
          const config = quizConfigs.find(c => c.id === fullResult.configId);
          onViewResult({ ...fullResult, config });
      } catch (error) {
          console.error('Failed to load result details:', error);
          addToast('加载详情失败', 'error');
      } finally {
          setProcessingId(null);
      }
  };

  const handleStartGrading = async (e: React.MouseEvent, result: QuizResult) => {
      e.stopPropagation();
      setProcessingId(result.id);
      try {
          // Always fetch full result to ensure we have question text and answers for grading
          // The list view might use a lightweight view that strips these details
          let fullResult = result;
          
          // Check if we need to fetch (if attempts missing or missing question text)
          const needsFetch = !result.attempts || result.attempts.length === 0 || !result.attempts[0].questionText;

          if (needsFetch) {
              const fetched = await getResultById(result.id);
              if (fetched) {
                  fullResult = fetched;
              } else {
                  addToast('无法加载答题详情', 'error');
                  return;
              }
          }
          
          setGradingResult(fullResult);
      } catch (error) {
          console.error('Failed to load result details for grading:', error);
          addToast('加载详情失败', 'error');
      } finally {
          setProcessingId(null);
      }
  };

  // Calculate total pages
  const totalQuestionPages = Math.ceil(totalQuestions / questionsPerPage);
  const totalPages = Math.ceil(totalUserResults / itemsPerPage);

  const handleRestoreQuestion = async (id: string) => {
    setProcessingId(id);
    try {
      await restoreQuestion(id);
      mutateQuestions();
      addToast('题目已恢复', 'success');
    } catch (error) {
      console.error('Failed to restore question:', error);
      addToast('恢复失败', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleHardDeleteQuestion = async (id: string) => {
    if (window.confirm('确定要永久删除这道题目吗？此操作无法撤销！')) {
      setProcessingId(id);
      try {
        await hardDeleteQuestion(id);
        mutateQuestions();
        addToast('题目已永久删除', 'success');
      } catch (error) {
        console.error('Failed to hard delete question:', error);
        addToast('删除失败', 'error');
      } finally {
        setProcessingId(null);
      }
    }
  };

  const refreshData = async () => {
      if (isRefreshing) return;
      setIsRefreshing(true);
      try {
          if (activeTab === 'list') {
              await mutateQuestions();
          } else if (activeTab === 'records') {
              await mutateResults();
          } else if (activeTab === 'users') {
              await mutateUsers();
          }
          addToast('刷新成功', 'success');
      } catch (error) {
          console.error('Refresh failed:', error);
          addToast('刷新失败', 'error');
      } finally {
          setIsRefreshing(false);
      }
      // Monitor refreshes itself
  };

  if (isQuestionsLoading && activeTab === 'list' && questions.length === 0) {
      return <div className="p-10 text-center">加载中...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
            <h2 className="text-3xl font-bold text-gray-800">管理员控制台</h2>
            <p className="text-sm text-gray-500 mt-1">
                {currentUser.role === UserRole.SUPER_ADMIN ? '超级管理员模式' : '普通管理员模式'}
            </p>
        </div>
        <div className="flex items-center space-x-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm overflow-x-auto max-w-full">
          {(activeTab === 'list' || activeTab === 'records') && (
            <Button
              variant="ghost"
              onClick={refreshData}
              disabled={isRefreshing}
              className="text-sm whitespace-nowrap px-2"
              title="刷新数据"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </Button>
          )}
          <Button 
            variant={activeTab === 'list' ? 'primary' : 'ghost'}
            onClick={() => setActiveTab('list')}
            className="text-sm whitespace-nowrap"
          >
            题目管理
          </Button>
          <Button 
            variant={activeTab === 'create' ? 'primary' : 'ghost'}
            onClick={() => setActiveTab('create')}
            className="text-sm whitespace-nowrap"
          >
            新建题目
          </Button>
          <Button 
            variant={activeTab === 'config' ? 'primary' : 'ghost'}
            onClick={() => setActiveTab('config')}
            className="text-sm whitespace-nowrap"
          >
            配题设置
          </Button>
          <Button 
            variant={activeTab === 'records' ? 'primary' : 'ghost'}
            onClick={() => setActiveTab('records')}
            className="text-sm whitespace-nowrap"
          >
            用户答题记录
          </Button>
          {currentUser.role === UserRole.SUPER_ADMIN && (
            <Button 
                variant={activeTab === 'users' ? 'primary' : 'ghost'}
                onClick={() => setActiveTab('users')}
                className="text-sm whitespace-nowrap"
            >
                用户管理
            </Button>
          )}

          {currentUser.role === UserRole.SUPER_ADMIN && (
            <Button
                variant={activeTab === 'monitor' ? 'primary' : 'ghost'}
                onClick={() => setActiveTab('monitor')}
                className="text-sm whitespace-nowrap"
            >
                系统监控
            </Button>
          )}
        </div>
      </div>

      {activeTab === 'create' && (
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 animate-fade-in">
           <QuestionForm 
             onSubmit={handleCreate} 
             onSaveAndContinue={handleSaveAndContinue}
             submitLabel="创建题目" 
             isLoading={isProcessing} 
           />
        </div>
      )}

      {activeTab === 'config' && (
          <QuizConfigForm />
      )}

      {activeTab === 'users' && currentUser.role === UserRole.SUPER_ADMIN && (
          <UserManagement />
      )}

      {activeTab === 'monitor' && currentUser.role === UserRole.SUPER_ADMIN && (
          <SystemMonitor />
      )}

      {activeTab === 'list' && (
        <div className="space-y-4 animate-fade-in">
            {/* Filter Bar */}
            <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
                <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                    <div className="md:col-span-2 flex gap-2">
                         <input 
                            type="text"
                            placeholder="搜索题目关键字..."
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                         />
                         <button 
                             onClick={() => {
                                 setShowRecycleBin(!showRecycleBin);
                                 setCurrentQuestionPage(1);
                             }} 
                             className={`px-3 py-2 border rounded-md transition-colors flex items-center justify-center ${
                                 showRecycleBin 
                                 ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
                                 : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50 hover:text-gray-700'
                             }`}
                             title={showRecycleBin ? "返回列表" : "回收站"}
                         >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                         </button>
                    </div>
                    <select 
                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 text-sm bg-white"
                        value={filterSubject}
                        onChange={(e) => setFilterSubject(e.target.value)}
                    >
                        <option value="">所有学科</option>
                        {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select 
                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 text-sm bg-white"
                        value={filterGrade}
                        onChange={(e) => setFilterGrade(e.target.value)}
                    >
                        <option value="">所有学段</option>
                        <option value={GradeLevel.PRIMARY}>小学</option>
                        <option value={GradeLevel.JUNIOR}>初中</option>
                        <option value={GradeLevel.SENIOR}>高中</option>
                    </select>
                    <select 
                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 text-sm bg-white"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="">所有题型</option>
                        <option value={QuestionType.MULTIPLE_CHOICE}>单选题</option>
                        <option value={QuestionType.MULTIPLE_SELECT}>多选题</option>
                        <option value={QuestionType.TRUE_FALSE}>判断题</option>
                        <option value={QuestionType.FILL_IN_THE_BLANK}>填空题</option>
                        <option value={QuestionType.SHORT_ANSWER}>简答题</option>
                    </select>
                     <select 
                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 text-sm bg-white"
                        value={filterDifficulty}
                        onChange={(e) => setFilterDifficulty(e.target.value)}
                    >
                        <option value="">所有难度</option>
                        <option value={Difficulty.EASY}>简单</option>
                        <option value={Difficulty.MEDIUM}>中等</option>
                        <option value={Difficulty.HARD}>困难</option>
                    </select>
                    <select 
                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500 text-sm bg-white"
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                    >
                        <option value="">所有分类</option>
                        {Object.values(QuestionCategory).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                {(searchTerm || filterSubject || filterGrade || filterType || filterDifficulty || filterCategory || showRecycleBin) && (
                    <div className="mt-3 flex justify-between items-center text-sm">
                        <span className="text-gray-500">
                            {showRecycleBin ? '回收站中 ' : '共找到 '} 
                            {totalQuestions} 个{showRecycleBin ? '已删除题目' : '符合条件的题目'}
                        </span>
                        {!showRecycleBin && <button onClick={resetFilters} className="text-primary-600 hover:text-primary-800 font-medium">清空筛选</button>}
                    </div>
                )}
            </div>

            {/* List */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            {questions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                    {totalQuestions === 0 ? '暂无题目，请创建新题目！' : '没有找到符合筛选条件的题目。'}
                </div>
            ) : (
                <>
                <ul className="divide-y divide-gray-100">
                {questions.map((q) => (
                    <li key={q.id} className={`p-4 transition-colors ${q.isDisabled ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                    <div className="flex justify-between items-start">
                        <div className={`flex-1 ${q.isDisabled ? 'opacity-50' : ''}`}>
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-primary-100 text-primary-700">
                                    {getTypeLabel(q.type)}
                                </span>
                                {q.subject && (
                                    <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700">
                                        {q.subject}
                                    </span>
                                )}
                                <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">
                                    {getGradeLabel(q.gradeLevel)}
                                </span>
                                <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${getDifficultyColor(q.difficulty)}`}>
                                        {q.difficulty === Difficulty.EASY ? '简单' : q.difficulty === Difficulty.MEDIUM ? '中等' : '困难'}
                                </span>
                                <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full border ${getCategoryColor(q.category)}`}>
                                    {q.category || '基础知识'}
                                </span>
                                {q.imageUrls && q.imageUrls.length > 0 && (
                                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 border border-gray-200" title="包含图片">
                                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        有图 ({q.imageUrls.length})
                                    </span>
                                )}
                                {q.isDisabled && (
                                    <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">
                                    已屏蔽
                                </span>
                            )}
                        </div>
                        <ExpandableQuestionContent 
                            content={q.text} 
                            isExpanded={expandedQuestionIds.has(q.id)} 
                            onToggle={() => toggleExpandQuestion(q.id)} 
                        />
                        <div className="text-sm text-gray-500 mt-1 flex items-start">
                                <span className="flex-shrink-0 mt-0.5">答案: </span>
                                {q.type === QuestionType.FILL_IN_THE_BLANK ? (
                                    <div className="ml-1 flex-1 min-w-0">
                                        <RichTextPreview 
                                            content={q.correctAnswer} 
                                            className="text-green-700 font-medium truncate" 
                                        />
                                    </div>
                                ) : q.type === QuestionType.MULTIPLE_SELECT ? (
                                    <div className="flex flex-wrap gap-2 ml-1 max-h-12 overflow-hidden">
                                        <RichTextPreview 
                                            content={q.correctAnswer} 
                                            className="font-semibold text-green-600 inline-block text-xs" 
                                        />
                                    </div>
                                ) : (
                                    <RichTextPreview 
                                        content={q.correctAnswer}
                                        className="font-semibold text-green-600 ml-1 flex-1 min-w-0 break-words line-clamp-2" 
                                    />
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                        {processingId === q.id ? (
                             <svg className="w-5 h-5 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                            <>
                            {showRecycleBin ? (
                                <>
                                    <Button 
                                        type="button"
                                        variant="secondary" 
                                        className="text-sm py-1 px-3 text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 border-green-200"
                                        onClick={(e) => { e.stopPropagation(); handleRestoreQuestion(q.id); }}
                                    >
                                        恢复
                                    </Button>
                                    <Button 
                                        type="button"
                                        variant="danger" 
                                        className="text-sm py-1 px-3" 
                                        onClick={(e) => { e.stopPropagation(); handleHardDeleteQuestion(q.id); }}
                                    >
                                        永久删除
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button 
                                            type="button"
                                            variant="secondary" 
                                            className="text-sm py-1 px-3"
                                            title={q.isDisabled ? "启用题目" : "屏蔽题目"}
                                            onClick={(e) => handleToggleDisable(e, q.id)}
                                    >
                                            {q.isDisabled ? (
                                                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            ) : (
                                                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                                </svg>
                                            )}
                                    </Button>
                                    <Button 
                                            type="button"
                                            variant="secondary" 
                                            className="text-sm py-1 px-3" 
                                            onClick={(e) => handleEditClick(e, q.id)}
                                        >
                                            修改
                                        </Button>
                                        <Button 
                                            type="button"
                                            variant="danger" 
                                            className="text-sm py-1 px-3" 
                                            onClick={(e) => initiateDelete(e, q.id)}
                                        >
                                            删除
                                        </Button>
                                </>
                            )}
                            </>
                        )}
                        </div>
                    </div>
                    </li>
                ))}
                </ul>
                {totalQuestionPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50">
                        <div className="text-sm text-gray-500">
                            显示 {(currentQuestionPage - 1) * questionsPerPage + 1} 到 {Math.min(currentQuestionPage * questionsPerPage, totalQuestions)} 条，共 {totalQuestions} 条
                        </div>
                        <div className="flex gap-2">
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                disabled={currentQuestionPage === 1}
                                onClick={() => setCurrentQuestionPage(prev => Math.max(1, prev - 1))}
                            >
                                上一页
                            </Button>
                            <div className="flex items-center gap-1">
                                {Array.from({ length: totalQuestionPages }, (_, i) => i + 1).map(page => {
                                    if (
                                        page === 1 || 
                                        page === totalQuestionPages || 
                                        (page >= currentQuestionPage - 1 && page <= currentQuestionPage + 1)
                                    ) {
                                        return (
                                            <button
                                                key={page}
                                                onClick={() => setCurrentQuestionPage(page)}
                                                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                                    currentQuestionPage === page 
                                                    ? 'bg-primary-600 text-white shadow-sm' 
                                                    : 'text-gray-600 hover:bg-gray-200'
                                                }`}
                                            >
                                                {page}
                                            </button>
                                        );
                                    } else if (
                                        page === currentQuestionPage - 2 || 
                                        page === currentQuestionPage + 2
                                    ) {
                                        return <span key={page} className="text-gray-400">...</span>;
                                    }
                                    return null;
                                })}
                            </div>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                disabled={currentQuestionPage === totalQuestionPages}
                                onClick={() => setCurrentQuestionPage(prev => Math.min(totalQuestionPages, prev + 1))}
                            >
                                下一页
                            </Button>
                        </div>
                    </div>
                )}
                </>
            )}
            </div>
        </div>
      )}

      {/* Records Tab */}
      {activeTab === 'records' && (
         <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
             <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                 <h3 className="font-bold text-gray-700">所有用户答题记录</h3>
                 <div className="relative w-64">
                    <input
                        type="text"
                        placeholder="搜索用户名..."
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
                    />
                    <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                 </div>
             </div>
             {isResultsLoading ? (
                <div className="p-10 text-center text-gray-500">加载中...</div>
             ) : totalUserResults === 0 ? (
                <div className="p-10 text-center text-gray-500">
                   {userSearchTerm ? '未找到匹配的用户记录' : '暂无任何用户答题记录。'}
                </div>
             ) : (
                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                        <tr>
                          <th className="px-6 py-3 font-medium">用户</th>
                          <th className="px-6 py-3 font-medium">试卷名称</th>
                          <th className="px-6 py-3 font-medium">提交时间</th>
                          <th className="px-6 py-3 font-medium">耗时</th>
                          <th className="px-6 py-3 font-medium">得分</th>
                          <th className="px-6 py-3 font-medium">状态</th>
                          <th className="px-6 py-3 font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                         {userResults.map((result) => (
                            <React.Fragment key={result.id}>
                            <tr 
                               className="hover:bg-primary-50 transition-colors cursor-pointer"
                               onClick={(e) => handleViewResultDetail(e, result)}
                            >
                              <td className="px-6 py-4 font-medium text-gray-900">
                                 {result.username}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                                 {result.configName || quizConfigs.find(c => c.id === result.configId)?.name || '未知试卷'}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600" title={`开始时间: ${new Date(result.timestamp - (result.duration || 0) * 1000).toLocaleString('zh-CN')}`}>
                                 {new Date(result.timestamp).toLocaleString('zh-CN')}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                 {formatDuration(result.duration)}
                              </td>
                              <td className="px-6 py-4">
                                 <span className="font-bold">{result.score}</span> <span className="text-gray-500">/ {result.maxScore || result.totalQuestions}</span>
                              </td>
                              <td className="px-6 py-4">
                                  {result.status === 'pending_grading' ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                          批改中
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
                              <td className="px-6 py-4 text-sm text-primary-600 font-medium">
                                 <div className="flex items-center gap-2">
                                     {result.status === 'pending_grading' ? (
                                         <button 
                                             onClick={(e) => handleStartGrading(e, result)}
                                             className="text-orange-600 hover:text-orange-800 font-bold border border-orange-200 bg-orange-50 px-3 py-1 rounded-md text-xs"
                                         >
                                             {processingId === result.id ? '加载中...' : '去批改'}
                                         </button>
                                     ) : (
                                         <span onClick={(e) => handleViewResultDetail(e, result)} className="cursor-pointer hover:underline">
                                             {processingId === result.id ? '加载中...' : '查看详情'}
                                         </span>
                                     )}
                                     <button
                                         onClick={(e) => { e.stopPropagation(); setRecordToDelete(result.id); }}
                                         className="text-gray-400 hover:text-red-500 p-1"
                                         title="删除记录"
                                     >
                                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                         </svg>
                                     </button>
                                 </div>
                              </td>
                            </tr>
                            {/* Second line for Part Scores - Only show if attempts are loaded or we have summary data */}
                            {(result.attempts && result.attempts.length > 0) && (
                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                    <td colSpan={7} className="px-6 py-2 pb-4">
                                        <div className="flex flex-wrap gap-2 pl-4 border-l-2 border-primary-200">
                                            {getPartScores(result)}
                                        </div>
                                    </td>
                                </tr>
                            )}
                            </React.Fragment>
                         ))}
                      </tbody>
                   </table>
                   
                   {/* Pagination Controls */}
                   {totalPages > 1 && (
                       <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                           <div className="text-sm text-gray-500">
                               显示 {((currentPage - 1) * itemsPerPage) + 1} 到 {Math.min(currentPage * itemsPerPage, totalUserResults)} 条，共 {totalUserResults} 条
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
                               {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
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
                                   disabled={currentPage === totalPages}
                                   onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
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

      {/* Edit Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
             <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="text-xl font-bold text-gray-800">修改题目</h3>
                <button 
                    onClick={() => setEditingQuestion(null)}
                    className="text-gray-400 hover:text-gray-600"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
             </div>
             <div className="p-6">
                <QuestionForm 
                    initialData={editingQuestion} 
                    onSubmit={handleUpdate} 
                    onCancel={() => setEditingQuestion(null)}
                    submitLabel="更新题目"
                    isLoading={isProcessing}
                />
             </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Question) */}
      {questionToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">确认删除</h3>
                <p className="text-gray-500 mb-6">您确定要删除这道题目吗？删除后无法恢复。</p>
                <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => setQuestionToDelete(null)}>取消</Button>
                    <Button variant="danger" onClick={confirmDelete} isLoading={isProcessing}>确认删除</Button>
                </div>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Record) */}
      {recordToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">确认删除记录</h3>
                <p className="text-gray-500 mb-6">您确定要删除这条答题记录吗？删除后无法恢复。</p>
                <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => setRecordToDelete(null)}>取消</Button>
                    <Button variant="danger" onClick={confirmDeleteRecord} isLoading={isProcessing}>确认删除</Button>
                </div>
            </div>
        </div>
      )}

      {/* Grading Modal */}
      {gradingResult && (
          <GradingModal 
              result={gradingResult}
              onClose={() => setGradingResult(null)}
              onComplete={() => {
                  setGradingResult(null);
                  mutateResults(); // Reload to see updated status
              }}
          />
      )}
    </div>
  );
};
