
import React, { useState, useEffect } from 'react';
import { Question, QuestionType, QuizAttempt, QuizResult } from '../types';
import { generateQuiz, gradeQuiz } from '../services/storageService';
import { Button } from './Button';
import { ImageWithPreview } from './ImageWithPreview';
import { useToast } from './Toast';
import { sanitizeHTML } from '../utils/sanitize';

const STORAGE_KEY_PREFIX = 'quiz_autosave_';

interface SavedSession {
  questions: Question[];
  answers: Record<string, string>;
  configName: string;
  passingScore: number;
  timestamp: number;
  startTime?: number;
}

interface QuizTakerProps {
  configId: string;
  onComplete: (result: QuizResult) => Promise<void>;
  onExit: () => void;
}

export const QuizTaker: React.FC<QuizTakerProps> = ({ configId, onComplete, onExit }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [configName, setConfigName] = useState('');
  const [passingScore, setPassingScore] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const startTime = React.useRef<number>(Date.now());
  const { addToast } = useToast();

  useEffect(() => {
    const load = async () => {
        const key = STORAGE_KEY_PREFIX + configId;
        const savedJson = localStorage.getItem(key);
        
        if (savedJson) {
            try {
                const saved: SavedSession = JSON.parse(savedJson);
                // Validate data integrity slightly
                if (saved.questions && Array.isArray(saved.questions) && saved.questions.length > 0) {
                    setQuestions(saved.questions);
                    setConfigName(saved.configName);
                    setPassingScore(saved.passingScore);
                    setAnswers(saved.answers || {});
                    if (saved.startTime) {
                        startTime.current = saved.startTime;
                    }
                    setIsLoading(false);
                    addToast('已恢复上次未完成的答题进度', 'info');
                    return;
                }
            } catch (e) {
                console.error("Invalid save data", e);
                localStorage.removeItem(key);
            }
        }

        // Load quiz based on specific configuration ID (if no save found)
        try {
            const { questions: quizQuestions, configName: name, passingScore: pScore } = await generateQuiz(configId); 
            setQuestions(quizQuestions);
            setConfigName(name);
            setPassingScore(pScore);
        } catch (error) {
            console.error("Failed to generate quiz:", error);
            addToast("无法加载试卷，请稍后重试", "error");
        } finally {
            setIsLoading(false);
        }
    };
    load();
  }, [configId]);

  // Auto-save effect
  useEffect(() => {
      if (!isLoading && questions.length > 0) {
          const handler = setTimeout(() => {
              const session: SavedSession = {
                  questions,
                  answers,
                  configName,
                  passingScore,
                  timestamp: Date.now(),
                  startTime: startTime.current
              };
              localStorage.setItem(STORAGE_KEY_PREFIX + configId, JSON.stringify(session));
          }, 1000);

          return () => clearTimeout(handler);
      }
  }, [answers, questions, configName, passingScore, isLoading, configId]);

  // Prevent accidental exit
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isSubmitting && questions.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSubmitting, questions.length]);

  const clearAutoSave = () => {
      localStorage.removeItem(STORAGE_KEY_PREFIX + configId);
  };

  const handleExit = () => {
      if (window.confirm('确定要放弃本次答题吗？您的进度将被清除。')) {
          clearAutoSave();
          onExit();
      }
  };

  const handleAnswerChange = (value: string) => {
    const qId = questions[currentIdx].id;
    setAnswers(prev => ({
      ...prev,
      [qId]: value
    }));
  };

  const handleMultiSelectChange = (value: string) => {
      const qId = questions[currentIdx].id;
      const currentValStr = answers[qId];
      let currentArr: string[] = [];
      
      try {
          if (currentValStr) {
              currentArr = JSON.parse(currentValStr);
          }
      } catch {
          currentArr = [];
      }

      let newArr;
      if (currentArr.includes(value)) {
          newArr = currentArr.filter(v => v !== value);
      } else {
          newArr = [...currentArr, value];
      }
      
      newArr.sort();
      handleAnswerChange(JSON.stringify(newArr));
  }

  const handleBlankChange = (index: number, value: string, totalBlanks: number) => {
      const qId = questions[currentIdx].id;
      const currentValStr = answers[qId];
      let currentArr: string[] = [];

      try {
          if (currentValStr) {
              currentArr = JSON.parse(currentValStr);
          }
      } catch {
          currentArr = currentValStr ? [currentValStr] : [];
      }

      // Ensure array has correct size
      while (currentArr.length < totalBlanks) currentArr.push('');

      currentArr[index] = value;
      handleAnswerChange(JSON.stringify(currentArr));
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      finishQuiz();
    }
  };

  const handlePrevious = () => {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    }
  };

  const finishQuiz = async () => {
    setIsSubmitting(true);
    
    // Prepare payload for grading service
    const attemptsPayload = questions.map(q => ({
        questionId: q.id,
        userAnswer: answers[q.id] || '',
        maxScore: q.score || 1
    }));

    // Call grading service
    let gradedResult;
    try {
        gradedResult = await gradeQuiz(attemptsPayload);
    } catch (error) {
        console.error("Grading failed", error);
        addToast('提交试卷失败，请重试', 'error');
        setIsSubmitting(false);
        return;
    }

    const { attempts: gradedAttempts, score } = gradedResult;
    
    let maxScore = 0;
    let hasPendingGrading = false;

    // Merge result and calculate totals
    const finalAttempts: QuizAttempt[] = gradedAttempts.map((ga: any) => {
        const q = questions.find(question => question.id === ga.questionId);
        if (!q) return ga;

        const questionPoints = q.score || 1;
        maxScore += questionPoints;

        if (q.type === QuestionType.SHORT_ANSWER && q.needsGrading) {
            hasPendingGrading = true;
        }

        return {
            ...ga,
            questionText: q.text,
            questionImageUrls: q.imageUrls || ((q as any).imageUrl ? [(q as any).imageUrl] : []),
            manualGrading: q.needsGrading
        };
    });

    const result: any = {
      score,
      maxScore,
      passingScore, // Save snapshot of passing score
      isPassed: !hasPendingGrading && score >= passingScore, // Determine status
      totalQuestions: questions.length,
      attempts: finalAttempts,
      configId: configId,
      configName: configName,
      status: hasPendingGrading ? 'pending_grading' : 'completed',
      duration: Math.floor((Date.now() - startTime.current) / 1000) // Duration in seconds
    };

    try {
        await onComplete(result);
        clearAutoSave();
    } catch (error) {
        console.error("Failed to complete quiz submission", error);
        // Toast is likely handled by onComplete, but we can add one here if needed
        // or just ensure we don't clearAutoSave
    } finally {
        setIsSubmitting(false);
    }
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

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div></div>;
  }

  if (questions.length === 0) {
     return (
        <div className="text-center p-8 bg-white rounded-xl shadow-lg border border-gray-100">
             <h3 className="text-xl font-bold text-gray-800 mb-4">暂无题目</h3>
             <p className="text-gray-600 mb-6">所选试卷 "{configName}" 的配置无法从当前题库中抽取足够的题目。</p>
             <Button onClick={onExit}>返回仪表盘</Button>
        </div>
     )
  }

  const currentQ = questions[currentIdx];
  
  // Robustness Check: Ensure currentQ exists
  if (!currentQ) {
      return (
          <div className="text-center p-8 bg-white rounded-xl shadow-lg border border-gray-100">
               <h3 className="text-xl font-bold text-red-600 mb-4">题目加载错误</h3>
               <p className="text-gray-600 mb-6">无法找到当前题目 (Index: {currentIdx})，请尝试刷新或重新开始。</p>
               <Button onClick={() => window.location.reload()}>刷新页面</Button>
               <div className="mt-4">
                 <button onClick={onExit} className="text-sm text-gray-500 underline">返回仪表盘</button>
               </div>
          </div>
      );
  }

  // Optimize performance for section stats calculation
  const currentPartStats = React.useMemo(() => {
      const partName = currentQ.quizPartName || '默认部分';
      const count = questions.filter(q => (q.quizPartName || '默认部分') === partName).length;
      return { name: partName, count };
  }, [currentQ.quizPartName, questions]);

  const progress = ((currentIdx + 1) / questions.length) * 100;
  const currentAnswer = answers[currentQ.id] || '';

  let selectedOptions: string[] = [];
  if (currentQ.type === QuestionType.MULTIPLE_SELECT) {
      try {
          selectedOptions = JSON.parse(currentAnswer || '[]');
      } catch {}
  }

  // Calculate Blank Count and Current Blank Answers for Fill-in-the-blank
  let blankCount = currentQ.blankCount || 1; // Use server-provided count first
  let currentBlankAnswers: string[] = [];
  
  if (currentQ.type === QuestionType.FILL_IN_THE_BLANK) {
      // Fallback calculation if blankCount not provided (legacy support)
      if (!currentQ.blankCount) {
          try {
              const parsed = JSON.parse(currentQ.correctAnswer);
              if (Array.isArray(parsed)) blankCount = parsed.length;
              else blankCount = 1;
          } catch {
              if (currentQ.correctAnswer && currentQ.correctAnswer.includes(';&&;')) {
                  blankCount = currentQ.correctAnswer.split(';&&;').length;
              }
          }
      }
      
      try {
          currentBlankAnswers = JSON.parse(currentAnswer || '[]');
      } catch {
          currentBlankAnswers = currentAnswer ? [currentAnswer] : [];
      }
      // Ensure visual consistency
      if (!Array.isArray(currentBlankAnswers)) currentBlankAnswers = [];
  }

  const images = currentQ.imageUrls || ((currentQ as any).imageUrl ? [(currentQ as any).imageUrl] : []);

  const hasAnswer = (q: Question) => {
      const ans = answers[q.id];
      if (!ans) return false;
      
      try {
          if (q.type === QuestionType.MULTIPLE_SELECT) {
              return ans !== '[]';
          }
          if (q.type === QuestionType.FILL_IN_THE_BLANK) {
              const arr = JSON.parse(ans);
              return Array.isArray(arr) && arr.some(v => v && v.trim() !== '');
          }
      } catch (e) {
          // If JSON parse fails but ans has value, consider it valid for safety
          // or invalid depending on strictness. Here we assume non-empty string is valid.
      }
      
      return ans.trim() !== '';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Main Content Area */}
      <div className="lg:col-span-3">
          <div className="mb-6 bg-gray-200 rounded-full h-2.5">
            <div className="bg-primary-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
          </div>

          {/* Mobile Question Navigation Toggle */}
          <div className="lg:hidden mb-4">
            <button 
                onClick={() => setShowMobileNav(!showMobileNav)}
                className="w-full bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center transition-colors hover:bg-gray-50"
            >
                <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-700">题号导航</span>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {Object.keys(answers).filter(k => {
                            const q = questions.find(qu => qu.id === k);
                            return q ? hasAnswer(q) : false;
                        }).length} / {questions.length} 已答
                    </span>
                </div>
                <svg className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${showMobileNav ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            
            {showMobileNav && (
                <div className="mt-2 bg-white rounded-xl shadow-lg border border-gray-100 p-4 animate-fade-in-down">
                    <div className="mb-3 flex justify-between items-center text-sm border-b border-gray-100 pb-2">
                         <span className="text-gray-500">当前部分: <span className="font-medium text-gray-800">{currentPartStats.name}</span></span>
                         <span className="text-xs bg-gray-50 px-2 py-1 rounded text-gray-500">本部分共 {currentPartStats.count} 题</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2 max-h-[40vh] overflow-y-auto custom-scrollbar">
                        {questions.map((q, idx) => {
                            const isCurrent = currentIdx === idx;
                            const answered = hasAnswer(q);
                            
                            return (
                                <button
                                    key={q.id}
                                    onClick={() => {
                                        setCurrentIdx(idx);
                                        setShowMobileNav(false);
                                    }}
                                    className={`
                                        h-10 w-full rounded-lg text-sm font-medium transition-all duration-200 border
                                        ${isCurrent 
                                            ? 'bg-primary-600 text-white border-primary-600 shadow-md' 
                                            : answered
                                                ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                        }
                                    `}
                                >
                                    {idx + 1}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
            <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex flex-col">
                        <span className="text-xs text-gray-400 font-medium uppercase mb-1">{configName}</span>
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-bold tracking-wider text-primary-600 uppercase">第 {currentIdx + 1} 题 / 共 {questions.length} 题</span>
                            {currentQ.score && (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full border border-yellow-200">
                                    {currentQ.score} 分
                                </span>
                            )}
                        </div>
                    </div>
                    <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">{getTypeLabel(currentQ.type)}</span>
                </div>
              
              {images.length > 0 && (
                <div className="mb-6 flex overflow-x-auto gap-4 pb-2">
                    {images.map((img, idx) => (
                        <ImageWithPreview 
                            key={idx} 
                            src={img} 
                            alt="Question Image" 
                            className="h-48 w-auto object-contain rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-zoom-in"
                        />
                    ))}
                </div>
              )}

              <h2 
                className="text-2xl text-gray-900 mb-8 ql-editor rich-text-content" 
                style={{ padding: 0 }}
                dangerouslySetInnerHTML={{ __html: sanitizeHTML(currentQ.text) }} 
              />

              <div className="space-y-4">
                {currentQ.type === QuestionType.MULTIPLE_CHOICE || currentQ.type === QuestionType.TRUE_FALSE ? (
                  <div className="grid gap-4">
                      {currentQ.options?.map((opt, idx) => (
                          <label 
                            key={idx} 
                            className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all ${currentAnswer === opt ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-200 hover:bg-gray-50'}`}
                          >
                              <input 
                                type="radio" 
                                name={`q-${currentQ.id}`}
                                value={opt} 
                                checked={currentAnswer === opt}
                                onChange={(e) => handleAnswerChange(e.target.value)}
                                className="h-5 w-5 text-primary-600 border-gray-300 focus:ring-primary-500"
                              />
                              <div className="ml-3 flex items-start">
                                {currentQ.type === QuestionType.MULTIPLE_CHOICE && (
                                    <span className="font-bold mr-2 mt-0.5">{String.fromCharCode(65 + idx)}.</span>
                                )}
                                <span className="font-medium text-gray-700 rich-text-content" dangerouslySetInnerHTML={{ __html: sanitizeHTML(opt) }} />
                              </div>
                          </label>
                      ))}
                  </div>
                ) : currentQ.type === QuestionType.MULTIPLE_SELECT ? (
                    <div className="grid gap-4">
                        {currentQ.options?.map((opt, idx) => {
                            const isChecked = selectedOptions.includes(opt);
                            return (
                                <label 
                                    key={idx} 
                                    className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all ${isChecked ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-200 hover:bg-gray-50'}`}
                                >
                                    <input 
                                        type="checkbox" 
                                        value={opt} 
                                        checked={isChecked}
                                        onChange={() => handleMultiSelectChange(opt)}
                                        className="h-5 w-5 text-primary-600 border-gray-300 focus:ring-primary-500 rounded"
                                    />
                                    <div className="ml-3 flex items-start">
                                        <span className="font-bold mr-2 mt-0.5">{String.fromCharCode(65 + idx)}.</span>
                                        <span className="font-medium text-gray-700 rich-text-content" dangerouslySetInnerHTML={{ __html: sanitizeHTML(opt) }} />
                                    </div>
                                </label>
                            )
                        })}
                    </div>
                ) : currentQ.type === QuestionType.FILL_IN_THE_BLANK ? (
                    <div className="space-y-3 mt-2">
                        {Array.from({ length: blankCount }).map((_, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                                <span className="text-gray-500 font-bold whitespace-nowrap">空 {idx + 1}:</span>
                                <input 
                                    type="text" 
                                    className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0 outline-none text-lg"
                                    placeholder={`在此输入第 ${idx + 1} 空的答案...`}
                                    value={currentBlankAnswers[idx] || ''}
                                    onChange={(e) => handleBlankChange(idx, e.target.value, blankCount)}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="mt-2">
                        <textarea 
                            className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0 outline-none text-lg min-h-[150px] resize-y"
                            placeholder="在此输入简答题答案..."
                            value={currentAnswer}
                            onChange={(e) => handleAnswerChange(e.target.value)}
                        />
                    </div>
                )}
              </div>
            </div>
            
            <div className="bg-gray-50 px-8 py-6 flex justify-between items-center border-t border-gray-100">
                <div className="text-sm text-gray-500">
                    {currentAnswer && (currentQ.type !== QuestionType.MULTIPLE_SELECT || selectedOptions.length > 0) ? '答案已保存' : '等待作答...'}
                </div>
                <div className="flex gap-3">
                    {currentIdx > 0 && (
                        <Button 
                            variant="secondary" 
                            onClick={handlePrevious}
                            disabled={isSubmitting}
                        >
                            上一题
                        </Button>
                    )}
                    <Button 
                        onClick={handleNext} 
                        disabled={!currentAnswer || (currentQ.type === QuestionType.MULTIPLE_SELECT && selectedOptions.length === 0)}
                        isLoading={isSubmitting}
                    >
                        {currentIdx === questions.length - 1 ? '提交试卷' : '下一题'}
                    </Button>
                </div>
            </div>
          </div>
          
          <div className="mt-4 text-center lg:hidden">
            <button onClick={handleExit} className="text-gray-400 hover:text-gray-600 text-sm underline">放弃并退出</button>
          </div>
      </div>

      {/* Sidebar Navigation */}
      <div className="hidden lg:block lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 sticky top-6">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-gray-700">题号导航</h3>
                  <span className="text-xs text-gray-500">{Object.keys(answers).filter(k => {
                      const q = questions.find(qu => qu.id === k);
                      return q ? hasAnswer(q) : false;
                  }).length} / {questions.length} 已答</span>
              </div>
              
              <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="text-xs text-gray-500 mb-1">当前部分</div>
                  <div className="font-medium text-gray-800 flex justify-between items-center">
                      <span className="truncate mr-2" title={currentPartStats.name}>{currentPartStats.name}</span>
                      <span className="text-xs bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-500 whitespace-nowrap">
                          共 {currentPartStats.count} 题
                      </span>
                  </div>
              </div>

              <div className="grid grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                  {questions.map((q, idx) => {
                      const isCurrent = currentIdx === idx;
                      const answered = hasAnswer(q);
                      
                      return (
                          <button
                              key={q.id}
                              onClick={() => setCurrentIdx(idx)}
                              className={`
                                  h-10 w-full rounded-lg text-sm font-medium transition-all duration-200 border
                                  ${isCurrent 
                                      ? 'bg-primary-600 text-white border-primary-600 shadow-md transform scale-105' 
                                      : answered
                                          ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                  }
                              `}
                          >
                              {idx + 1}
                          </button>
                      );
                  })}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="w-3 h-3 rounded-full bg-primary-600"></div>
                      <span>当前题目</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="w-3 h-3 rounded-full bg-blue-50 border border-blue-200"></div>
                      <span>已作答</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="w-3 h-3 rounded-full bg-white border border-gray-200"></div>
                      <span>未作答</span>
                  </div>
              </div>

              <div className="mt-8">
                  <button 
                      onClick={handleExit} 
                      className="w-full py-2 px-4 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      放弃考试
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
};
