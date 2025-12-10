
import React, { useState, useEffect } from 'react';
import { QuizResult, Question, QuestionType, QuizConfig, QuizPartConfig } from '../types';
import { getQuizConfig, gradeQuizResult, getAllQuestionsRaw } from '../services/storageService';
import { Button } from './Button';
import { ImageWithPreview } from './ImageWithPreview';
import { useToast } from './Toast';

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
  const { addToast } = useToast();

  useEffect(() => {
      const load = async () => {
          // We need to know if questions are deleted, and to get explanations if not in snapshot
          const questions = await getAllQuestionsRaw();
          setAllQuestions(questions);

          if (!config && result.configId) {
              const conf = await getQuizConfig(result.configId);
              setConfig(conf);
          }
          
          setIsLoading(false);
      };
      load();
  }, [result.configId]);

  // Sync local result if prop changes (though unlikely in this flow)
  useEffect(() => {
      setLocalResult(result);
  }, [result]);

  // Calculate percentage
  const totalPossible = localResult.maxScore || localResult.totalQuestions;
  const percentage = totalPossible > 0 ? Math.round((localResult.score / totalPossible) * 100) : 0;

  // Check if question exists in DB by ID
  const isQuestionDeleted = (id: string) => {
    if (allQuestions.length === 0) return false;
    return !allQuestions.some(q => String(q.id) === String(id));
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
    const q = allQuestions.find(q => String(q.id) === String(id));
    return q?.text || "该题目已完全从题库中删除且无备份";
  };
  
  const getQuestionImages = (id: string, snapshot?: string[]) => {
    if (snapshot && snapshot.length > 0) return snapshot;
    const q = allQuestions.find(q => String(q.id) === String(id));
    if (q) return q.imageUrls || ((q as any).imageUrl ? [(q as any).imageUrl] : []);
    return [];
  }

  const getCorrectAnswerRaw = (id: string, snapshot?: string) => {
    if (snapshot) return snapshot;
    const q = allQuestions.find(q => String(q.id) === String(id));
    return q?.correctAnswer || "未知";
  };

  const renderRichTextAnswer = (content: string) => {
      if (!content) return <span className="text-gray-400">(未作答)</span>;
  
      try {
          if (content.startsWith('[') && content.endsWith(']')) {
              const parsed = JSON.parse(content);
              if (Array.isArray(parsed)) {
                  return (
                      <div className="flex flex-wrap gap-2">
                          {parsed.map((item, i) => (
                              <span key={i} className="inline-block px-2 py-0.5 rounded border border-gray-300 bg-white/80 rich-text-content" dangerouslySetInnerHTML={{ __html: item }} />
                          ))}
                      </div>
                  );
              }
          }
      } catch (e) {
          // Fallback to normal render
      }
  
      return <div className="rich-text-content inline-block" dangerouslySetInnerHTML={{ __html: content }} />;
    };

  // Helper to get explanation, falling back to snapshot
  const getExplanation = (id: string, snapshot?: string) => {
    if (snapshot) return snapshot;
    const q = allQuestions.find(q => String(q.id) === String(id));
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
      
      await gradeQuizResult(localResult.id, newAttempts, finalScore, newIsPassed);
      
      const nextEdits = { ...editingScores };
      delete nextEdits[idx];
      setEditingScores(nextEdits);
      
      setIsSaving(false);
  };

  if (isAdmin && isLoading) {
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
      {config && config.parts && (
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
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
             <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                 <h3 className="font-bold text-gray-700">答题详情回顾</h3>
             </div>
             <div className="divide-y divide-gray-100">
                 {localResult.attempts.map((attempt, idx) => {
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
                                     <div className="font-medium text-gray-900 mb-2 ql-editor" style={{ padding: 0 }}>
                                        <div dangerouslySetInnerHTML={{ __html: questionText }} />
                                        {isDeleted && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                                           该题目已删除
                                        </span>}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                         <div className={`p-3 rounded-lg border ${attempt.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                             <span className="block text-xs uppercase font-bold opacity-70 mb-1">您的答案</span>
                                             <div className="font-semibold break-words">
                                                 {renderRichTextAnswer(attempt.userAnswer)}
                                             </div>
                                         </div>
                                         {!attempt.isCorrect && (
                                             <div className="p-3 rounded-lg border bg-gray-50 border-gray-200">
                                                <span className="block text-xs uppercase font-bold text-gray-500 mb-1">正确答案</span>
                                                <div className="font-semibold text-gray-800 break-words">
                                                    {renderRichTextAnswer(correctTextRaw)}
                                                </div>
                                             </div>
                                         )}
                                     </div>
                                     
                                     <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800">
                                         <span className="font-bold mr-1">💡 解析:</span>
                                         {explanation && explanation.trim() !== '' && explanation !== '<p><br></p>' ? (
                                             <div className="ql-editor rich-text-content inline-block align-top" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: explanation }} />
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
          </div>
      )}
    </div>
  );
};
