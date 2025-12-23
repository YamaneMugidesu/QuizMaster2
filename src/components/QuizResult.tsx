
import React, { useState, useEffect, useRef } from 'react';
import { QuizResult, Question, QuestionType, QuizConfig, QuizPartConfig } from '../types';
import { getQuizConfig, gradeQuizResult, getQuestionsByIds, getResultById } from '../services/storageService';
import { Button } from './Button';
import { ImageWithPreview } from './ImageWithPreview';
import { RichTextPreview } from './RichTextPreview';
import { useToast } from './Toast';
import { sanitizeHTML } from '../utils/sanitize';

interface QuizResultProps {
  result: QuizResult;
  onRetry?: () => void;
  onExit: () => void;
  isAdmin?: boolean;
}

export const QuizResultView: React.FC<QuizResultProps> = ({ result, onRetry, onExit, isAdmin = false }) => {
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [config, setConfig] = useState<QuizConfig | null>(result.config || null);
  const [localResult, setLocalResult] = useState<QuizResult>(result);
  const [editingScores, setEditingScores] = useState<{ [key: number]: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Pagination for Review Section
  const [reviewPage, setReviewPage] = useState(1);
  const reviewItemsPerPage = 10;
  const [shouldScrollToReview, setShouldScrollToReview] = useState(false);
  const reviewSectionRef = useRef<HTMLDivElement>(null);
  
  // Lazy loading cache for questions
  const [fetchedQuestions, setFetchedQuestions] = useState<Map<string, Question>>(new Map());

  const { addToast } = useToast();

  useEffect(() => {
      const load = async () => {
          let currentResult = result;

          // If attempts are missing (due to list optimization), fetch full details
          if (!currentResult.attempts || currentResult.attempts.length === 0) {
              const fullResult = await getResultById(result.id);
              if (fullResult) {
                  currentResult = fullResult;
                  setLocalResult(fullResult);
              } else {
                  addToast('无法加载答题详情', 'error');
                  setIsLoading(false);
                  return;
              }
          }

          if (!config && currentResult.configId) {
              // Include deleted configs for historical review
              const conf = await getQuizConfig(currentResult.configId, true);
              setConfig(conf);
          }
          
          setIsLoading(false);
      };
      load();
  }, [result.id]);

  // Lazy load questions when page changes or result loads
  useEffect(() => {
      if (isLoading || !localResult.attempts) return;

      const fetchPageQuestions = async () => {
          const startIndex = (reviewPage - 1) * reviewItemsPerPage;
          const endIndex = startIndex + reviewItemsPerPage;
          const currentAttempts = localResult.attempts.slice(startIndex, endIndex);
          
          const idsToFetch = currentAttempts
              .map(a => a.questionId)
              .filter(id => !fetchedQuestions.has(id));
          
          const uniqueIds = Array.from(new Set(idsToFetch));
          
          if (uniqueIds.length > 0) {
              try {
                  const newQuestions = await getQuestionsByIds(uniqueIds, true);
                  setFetchedQuestions(prev => {
                      const next = new Map(prev);
                      newQuestions.forEach(q => next.set(q.id, q));
                      // Also mark IDs that returned nothing as fetched (to avoid infinite retries)
                      // Ideally getQuestionsByIds returns everything found. Missing ones are deleted.
                      uniqueIds.forEach(id => {
                          if (!next.has(id)) {
                              // Create a dummy deleted question marker if needed, 
                              // or just rely on the fact that getQuestionText handles missing ones.
                              // But to stop refetching, we should probably mark them.
                              // However, for simplicity, we just rely on newQuestions for now.
                              // A robust implementation would mark missing IDs too.
                          }
                      });
                      return next;
                  });
              } catch (e) {
                  console.error("Failed to fetch page questions", e);
              }
          }
      };

      fetchPageQuestions();
  }, [reviewPage, localResult.attempts, isLoading]); // fetchedQuestions omitted to avoid loop, we check inside

  // Handle scrolling to review section when page changes
  useEffect(() => {
      if (shouldScrollToReview && reviewSectionRef.current) {
          const headerOffset = 100; // Account for sticky header
          const elementPosition = reviewSectionRef.current.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
              top: offsetPosition,
              behavior: "smooth"
          });
          setShouldScrollToReview(false);
      }
  }, [reviewPage, shouldScrollToReview]);

  // Sync local result if prop changes (though unlikely in this flow)
  useEffect(() => {
      setLocalResult(result);
  }, [result]);

  // Calculate percentage
  const totalPossible = localResult.maxScore || localResult.totalQuestions;
  const percentage = totalPossible > 0 ? Math.round((localResult.score / totalPossible) * 100) : 0;

  // Check if question exists in DB by ID
  const isQuestionDeleted = (id: string) => {
    // If not fetched yet, assume not deleted (or loading)
    if (fetchedQuestions.size === 0 && allQuestions.length === 0) return false;
    
    // Check in lazy cache first
    if (fetchedQuestions.has(id)) return !!fetchedQuestions.get(id)?.isDeleted;

    // Fallback to legacy array if used
    if (allQuestions.length > 0) return !allQuestions.some(q => String(q.id) === String(id));

    return false; 
  };
  
  // Updated Helper: Lookup in Map or Array
  const getQuestionById = (id: string) => {
      if (fetchedQuestions.has(id)) return fetchedQuestions.get(id);
      return allQuestions.find(q => String(q.id) === String(id));
  };

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return null;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  };

  // Helper to get full question details, falling back to snapshot if deleted
  // We prioritize snapshot to ensure historical accuracy (if question changed after exam)
  const getQuestionText = (id: string, snapshot?: string) => {
    // If snapshot exists, use it (historical version)
    if (snapshot) return snapshot;
    // Otherwise try to find current version (legacy records or fallback)
    const q = getQuestionById(id);
    return q?.text || "该题目已完全从题库中删除且无备份";
  };
  
  const getQuestionImages = (id: string, snapshot?: string[]) => {
    if (snapshot && snapshot.length > 0) return snapshot;
    const q = getQuestionById(id);
    if (q) return q.imageUrls || ((q as any).imageUrl ? [(q as any).imageUrl] : []);
    return [];
  }

  const getCorrectAnswerRaw = (id: string, snapshot?: string) => {
    if (snapshot) return snapshot;
    const q = getQuestionById(id);
    return q?.correctAnswer || "未知";
  };

  // Helper to normalize HTML content for comparison
  const normalizeHtml = (html: string) => {
    if (!html) return '';
    // Basic stripping of HTML tags
    const text = html.replace(/<[^>]*>/g, '');
    // Collapse whitespace
    return text.replace(/\s+/g, ' ').trim();
  };

  // Helper to get explanation, falling back to snapshot
  const getExplanation = (id: string, snapshot?: string) => {
    if (snapshot) return snapshot;
    const q = getQuestionById(id);
    return q?.explanation || "";
  };

  const calculatePartScores = () => {
    if (!config || !config.parts || localResult.attempts.length === 0) return [];

    let currentAttemptIdx = 0;
    return config.parts.map(part => {
        // Safety check
        if (currentAttemptIdx >= localResult.attempts.length) {
            return { name: part.name, score: 0, maxScore: 0 };
        }

        const partAttempts = localResult.attempts.slice(currentAttemptIdx, currentAttemptIdx + part.count);
        currentAttemptIdx += part.count;
        
        const score = partAttempts.reduce((sum, a) => sum + (a?.score || 0), 0);
        const maxScore = partAttempts.reduce((sum, a) => sum + (a?.maxScore || 0), 0);

        return {
            name: part.name,
            score: Math.round(score * 10) / 10,
            maxScore: maxScore
        };
    });
  };

  const handleScoreChange = (idx: number, val: string) => {
      setEditingScores(prev => ({
          ...prev,
          [idx]: val
      }));
  };

  const saveScore = async (idx: number, attempt: any) => {
      const newScoreStr = editingScores[idx];
      if (newScoreStr === undefined) return; 
      
      const newScore = parseFloat(newScoreStr);
      const maxScore = attempt.maxScore || 0;

      if (isNaN(newScore) || newScore < 0 || newScore > maxScore) {
          addToast(`分数必须在 0 到 ${maxScore} 之间`, 'warning');
          return;
      }

      setIsSaving(true);
      
      const newAttempts = [...localResult.attempts];
      newAttempts[idx] = {
          ...newAttempts[idx],
          score: newScore,
          isCorrect: newScore === maxScore // Simple heuristic: full score = correct
      };

      const newTotalScore = newAttempts.reduce((acc, curr) => acc + (curr.score || 0), 0);
      // Round to 1 decimal place to avoid float errors
      const finalScore = Math.round(newTotalScore * 10) / 10;
      
      const newIsPassed = localResult.passingScore ? finalScore >= localResult.passingScore : false;

      const updatedResult = {
          ...localResult,
          attempts: newAttempts,
          score: finalScore,
          isPassed: newIsPassed
      };

      setLocalResult(updatedResult);
      
      const oldScore = localResult.attempts[idx].score || 0;

      try {
          await gradeQuizResult(
              localResult.id, 
              newAttempts, 
              finalScore, 
              newIsPassed, 
              {
                  type: 'SINGLE_UPDATE',
                  questionId: attempt.questionId,
                  oldScore: oldScore,
                  newScore: newScore
              }
          );
          
          const nextEdits = { ...editingScores };
          delete nextEdits[idx];
          setEditingScores(nextEdits);
          addToast('分数修改成功', 'success');
      } catch (error) {
          console.error('Failed to save score:', error);
          addToast('保存分数失败', 'error');
          // Revert local state if needed, or just let user try again.
          // For now, we leave the local state as is, assuming user might try again.
          // Ideally we should revert, but localResult is just UI state here.
      } finally {
          setIsSaving(false);
      }
  };

  if (isAdmin && isLoading && (!localResult.attempts || localResult.attempts.length === 0)) {
      // Only show full page loading if we absolutely have no data to show (e.g. deep link)
      // If we have summary data passed from props, we show that while loading attempts.
      return <div className="text-center p-10">加载详情中...</div>;
  }

  // PENDING GRADING VIEW FOR USERS
  if (result.status === 'pending_grading' && !isAdmin) {
      return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-8 text-center p-16">
                <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-12 h-12 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 className="text-3xl font-bold text-gray-800 mb-4">试卷批改中</h2>
                <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto">
                    您的试卷包含需要人工批改的简答题。管理员将在后台进行阅卷，请稍后在"答题记录"中查看最终成绩。
                </p>
                <Button onClick={onExit}>返回首页</Button>
            </div>
        </div>
      );
  }

  const totalReviewPages = Math.ceil(localResult.attempts.length / reviewItemsPerPage);
  const paginatedAttempts = localResult.attempts.slice(
      (reviewPage - 1) * reviewItemsPerPage,
      reviewPage * reviewItemsPerPage
  );

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-8 text-center p-10">
        <div className="mb-4">
            {localResult.isPassed !== undefined ? (
                localResult.isPassed ? (
                    <span className="inline-block px-4 py-2 rounded-full bg-green-100 text-green-700 text-xl font-bold border border-green-200">
                        🎉 考核合格
                    </span>
                ) : (
                    <span className="inline-block px-4 py-2 rounded-full bg-red-100 text-red-700 text-xl font-bold border border-red-200">
                        ⚠️ 考核不合格
                    </span>
                )
            ) : null}
        </div>

        <h2 className="text-3xl font-bold text-gray-800 mb-2">答题成绩单</h2>
        <p className="text-gray-500 mb-2">
            用户: <span className="font-semibold text-gray-800">{localResult.username}</span> &nbsp;|&nbsp; 
            时间: {new Date(localResult.timestamp).toLocaleString('zh-CN')}
            {localResult.duration !== undefined && (
                <>
                     &nbsp;|&nbsp; 耗时: <span className="font-semibold text-gray-800">{formatDuration(localResult.duration)}</span>
                </>
            )}
        </p>
        
        {localResult.passingScore !== undefined && localResult.passingScore > 0 && (
            <p className="text-sm text-gray-400 mb-6">
                (合格分数线: {localResult.passingScore} 分)
            </p>
        )}

        <div className="flex justify-center items-center mb-8">
            <div className={`
                relative flex items-center justify-center w-40 h-40 rounded-full border-8 
                ${localResult.isPassed ? 'border-green-500 text-green-600' : 'border-red-500 text-red-600'}
            `}>
                <div className="text-center">
                    <span className="block text-4xl font-extrabold">{percentage}%</span>
                    <span className="text-sm font-medium text-gray-500">
                        {localResult.score} / {totalPossible} {localResult.maxScore ? '分' : '题'}
                    </span>
                </div>
            </div>
        </div>

        <div className="flex justify-center gap-4">
            <Button variant="secondary" onClick={onExit}>返回列表</Button>
            {onRetry && <Button onClick={onRetry}>再测一次</Button>}
        </div>
      </div>

      {/* Section Scores (New) */}
      {config && config.parts && (localResult.attempts && localResult.attempts.length > 0) && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-8">
              <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
                  <h3 className="font-bold text-blue-800">各部分得分详情</h3>
              </div>
              <div className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {calculatePartScores().map((part, i) => (
                          <div key={i} className="p-4 rounded-lg border border-gray-200 bg-gray-50">
                              <h4 className="font-bold text-gray-700 mb-2">{part.name}</h4>
                              <div className="flex items-end gap-2">
                                  <span className="text-2xl font-bold text-primary-600">{part.score}</span>
                                  <span className="text-sm text-gray-500 mb-1">/ {part.maxScore} 分</span>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* Review Section - Visible to admins or if quiz is in practice mode */}
      {(isAdmin || config?.quizMode !== 'exam') && (
      <div 
        id="review-section" 
        className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden"
      >
             <div 
                ref={reviewSectionRef}
                className="px-6 py-4 bg-gray-50 border-b border-gray-200 scroll-mt-24"
             >
                 <h3 className="font-bold text-gray-700">答题详情回顾</h3>
             </div>
             {(!localResult.attempts || localResult.attempts.length === 0) ? (
                 <div className="p-10 text-center text-gray-500">
                     {isLoading ? (
                         <div className="flex flex-col items-center justify-center">
                             <svg className="w-8 h-8 animate-spin text-primary-500 mb-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                             <span>正在加载试题详情...</span>
                         </div>
                     ) : (
                         "暂无详细记录"
                     )}
                 </div>
             ) : (
             <>
             <div className="divide-y divide-gray-100">
                 {paginatedAttempts.map((attempt, relativeIdx) => {
                     const idx = (reviewPage - 1) * reviewItemsPerPage + relativeIdx;
                     const qObj = getQuestionById(attempt.questionId);
                     const questionText = getQuestionText(attempt.questionId, attempt.questionText);
                     const correctTextRaw = getCorrectAnswerRaw(attempt.questionId, attempt.correctAnswerText);
                     const questionImages = getQuestionImages(attempt.questionId, attempt.questionImageUrls);
                     const isDeleted = isQuestionDeleted(attempt.questionId);
                     const explanation = getExplanation(attempt.questionId, attempt.explanation);

                     return (
                         <div key={idx} className="p-6">
                             <div className="flex items-start gap-4">
                                 <div className={`mt-1 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${attempt.isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
                                     {attempt.isCorrect ? '✓' : '✕'}
                                 </div>
                                 <div className="flex-1">
                                     {questionImages.length > 0 && (
                                         <div className="mb-3 flex gap-2 overflow-x-auto">
                                             {questionImages.map((img, i) => (
                                                <ImageWithPreview key={i} src={img} alt="题图" className="h-24 object-contain rounded border border-gray-200" />
                                             ))}
                                         </div>
                                     )}
                                     <div className="font-medium text-gray-900 mb-2">
                                        <RichTextPreview content={questionText} />
                                        {isDeleted && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                                           该题目已删除
                                        </span>}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                        {/* Only show boxed answer summary for non-choice questions (or deleted ones) */}
                                        {(!qObj || (qObj.type !== QuestionType.MULTIPLE_CHOICE && qObj.type !== QuestionType.MULTIPLE_SELECT)) && (
                                            <>
                                                <div className={`p-3 rounded-lg border ${attempt.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                                    <span className="block text-xs uppercase font-bold opacity-70 mb-1">您的答案</span>
                                                    <div className="font-semibold break-words">
                                                        <RichTextPreview 
                                                            content={attempt.userAnswer} 
                                                            placeholder="(未作答)"
                                                        />
                                                    </div>
                                                </div>
                                                {!attempt.isCorrect && (
                                                    <div className="p-3 rounded-lg border bg-gray-50 border-gray-200">
                                                        <span className="block text-xs uppercase font-bold text-gray-500 mb-1">正确答案</span>
                                                        <div className="font-semibold text-gray-800 break-words">
                                                            <RichTextPreview 
                                                                content={correctTextRaw} 
                                                                placeholder="(未知)"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                     {/* Options Review for Choice/Select */}
                                     {qObj && (qObj.type === QuestionType.MULTIPLE_CHOICE || qObj.type === QuestionType.MULTIPLE_SELECT) && qObj.options && (
                                        <div className="mt-4 space-y-2">
                                            <div className="text-xs font-bold text-gray-500 uppercase">选项详情:</div>
                                            {qObj.options.map((opt, i) => {
                                                const label = String.fromCharCode(65 + i);
                                                
                                                // Determine selection status
                                                let isSelected = false;
                                                if (qObj.type === QuestionType.MULTIPLE_SELECT) {
                                                    try {
                                                        const userArr = JSON.parse(attempt.userAnswer || '[]');
                                                        isSelected = userArr.includes(opt);
                                                        // Fallback fuzzy match
                                                        if (!isSelected) {
                                                            const normOpt = normalizeHtml(opt);
                                                            isSelected = userArr.some((u: string) => normalizeHtml(u) === normOpt);
                                                        }
                                                    } catch {}
                                                } else {
                                                    isSelected = attempt.userAnswer === opt;
                                                    // Fallback fuzzy match
                                                    if (!isSelected && attempt.userAnswer) {
                                                        isSelected = normalizeHtml(attempt.userAnswer) === normalizeHtml(opt);
                                                    }
                                                }

                                                // Determine correctness status
                                                let isCorrectOption = false;
                                                // Use snapshot correct answer if available to match grading logic
                                                const correctText = attempt.correctAnswerText || qObj.correctAnswer;
                                                if (qObj.type === QuestionType.MULTIPLE_SELECT) {
                                                    try {
                                                        const correctArr = JSON.parse(correctText || '[]');
                                                        isCorrectOption = correctArr.includes(opt);
                                                        // Fallback fuzzy match
                                                        if (!isCorrectOption) {
                                                            const normOpt = normalizeHtml(opt);
                                                            isCorrectOption = correctArr.some((c: string) => normalizeHtml(c) === normOpt);
                                                        }
                                                    } catch {}
                                                } else {
                                                    isCorrectOption = correctText === opt;
                                                    // Fallback fuzzy match
                                                    if (!isCorrectOption && correctText) {
                                                        isCorrectOption = normalizeHtml(correctText) === normalizeHtml(opt);
                                                    }
                                                }

                                                let borderClass = "border-gray-200";
                                                let bgClass = "bg-white";
                                                let icon = null;

                                                if (isSelected && isCorrectOption) {
                                                    borderClass = "border-green-500";
                                                    bgClass = "bg-green-50";
                                                    icon = <span className="text-green-600 font-bold text-xs ml-auto">✓ 您的答案 (正确)</span>;
                                                } else if (isSelected && !isCorrectOption) {
                                                    borderClass = "border-red-500";
                                                    bgClass = "bg-red-50";
                                                    icon = <span className="text-red-600 font-bold text-xs ml-auto">✕ 您的答案 (错误)</span>;
                                                } else if (isCorrectOption) {
                                                    borderClass = "border-green-500";
                                                    bgClass = "bg-white border-dashed"; 
                                                    icon = <span className="text-green-600 font-bold text-xs ml-auto">✓ 正确答案</span>;
                                                }

                                                return (
                                                    <div key={i} className={`flex items-center p-3 border rounded-lg ${borderClass} ${bgClass}`}>
                                                        <span className="font-bold text-gray-500 mr-3">{label}.</span>
                                                        <RichTextPreview content={opt} className="flex-1" />
                                                        {icon}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                     )}
                                     
                                     <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800">
                                         <span className="font-bold mr-1">💡 解析:</span>
                                         {explanation && explanation.trim() !== '' && explanation !== '<p><br></p>' ? (
                                             <RichTextPreview 
                                                 content={explanation} 
                                                 className="inline-block align-top"
                                             />
                                         ) : (
                                             <span>无</span>
                                         )}
                                     </div>

                                     {/* Admin Score Edit */}
                                     {isAdmin && (
                                        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-bold text-gray-700">得分管理:</span>
                                                <div className="flex items-center">
                                                    <input 
                                                        type="number" 
                                                        value={editingScores[idx] !== undefined ? editingScores[idx] : (attempt.score || 0)}
                                                        onChange={(e) => handleScoreChange(idx, e.target.value)}
                                                        className="w-24 p-1 border border-gray-300 rounded text-center font-bold text-primary-600 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                                                        min="0"
                                                        max={attempt.maxScore || 0}
                                                        step="0.1"
                                                    />
                                                    <span className="ml-2 text-sm text-gray-500">/ {attempt.maxScore} 分</span>
                                                </div>
                                            </div>
                                            {editingScores[idx] !== undefined && (
                                                <Button 
                                                    size="sm" 
                                                    onClick={() => saveScore(idx, attempt)}
                                                    disabled={isSaving}
                                                >
                                                    保存修改
                                                </Button>
                                            )}
                                        </div>
                                     )}
                                 </div>
                             </div>
                         </div>
                     )
                 })}
             </div>
             
             {/* Review Pagination */}
             {totalReviewPages > 1 && (
                 <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                     <div className="text-sm text-gray-500">
                         显示 {((reviewPage - 1) * reviewItemsPerPage) + 1} 到 {Math.min(reviewPage * reviewItemsPerPage, localResult.attempts.length)} 题，共 {localResult.attempts.length} 题
                     </div>
                     <div className="flex space-x-2">
                         <Button 
                             variant="secondary" 
                             size="sm"
                             disabled={reviewPage === 1}
                             onClick={() => {
                                 setReviewPage(prev => Math.max(1, prev - 1));
                                 setShouldScrollToReview(true);
                             }}
                         >
                             上一页
                         </Button>
                         <div className="flex items-center space-x-1">
                            {Array.from({ length: Math.min(5, totalReviewPages) }, (_, i) => {
                                let p = i + 1;
                                if (totalReviewPages > 5) {
                                    if (reviewPage > 3) p = reviewPage - 2 + i;
                                    if (p > totalReviewPages) p = totalReviewPages - (4 - i);
                                }
                                return p;
                            }).map(p => (
                                <button
                                    key={p}
                                    onClick={() => {
                                        setReviewPage(p);
                                        setShouldScrollToReview(true);
                                    }}
                                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                        reviewPage === p
                                            ? 'bg-primary-600 text-white shadow-sm'
                                            : 'text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}
                         </div>
                         <Button 
                             variant="secondary" 
                             size="sm"
                             disabled={reviewPage === totalReviewPages}
                             onClick={() => {
                                 setReviewPage(prev => Math.min(totalReviewPages, prev + 1));
                                 setShouldScrollToReview(true);
                             }}
                         >
                             下一页
                         </Button>
                     </div>
                 </div>
             )}
          </>
          )}
      </div>
      )}
    </div>
  );
};
