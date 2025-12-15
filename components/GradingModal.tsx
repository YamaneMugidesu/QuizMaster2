
import React, { useState } from 'react';
import { QuizResult, QuizAttempt } from '../types';
import { gradeQuizResult } from '../services/storageService';
import { Button } from './Button';
import { ImageWithPreview } from './ImageWithPreview';
import { useToast } from './Toast';
import { sanitizeHTML } from '../utils/sanitize';

interface GradingModalProps {
  result: QuizResult;
  onClose: () => void;
  onComplete: () => void;
}

export const GradingModal: React.FC<GradingModalProps> = ({ result, onClose, onComplete }) => {
  const [attempts, setAttempts] = useState<QuizAttempt[]>(JSON.parse(JSON.stringify(result.attempts)));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addToast } = useToast();

  const handleScoreChange = (index: number, newScore: string) => {
    const scoreNum = parseFloat(newScore);
    if (isNaN(scoreNum)) return;

    const newAttempts = [...attempts];
    const maxScore = newAttempts[index].maxScore || 0;
    
    // Clamp score between 0 and maxScore
    newAttempts[index].score = Math.min(Math.max(0, scoreNum), maxScore);
    // Mark as correct if score > 0 (or maybe just partial credit? Let's keep simple: > 0 is correct-ish, but score matters most)
    // Actually for manual grading, isCorrect might be less relevant than the actual score, but let's update it based on full score.
    newAttempts[index].isCorrect = newAttempts[index].score === maxScore;
    
    setAttempts(newAttempts);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Recalculate total score
      const finalScore = attempts.reduce((sum, a) => sum + (a.score || 0), 0);
      const isPassed = finalScore >= result.passingScore;

      await gradeQuizResult(result.id, attempts, finalScore, isPassed);
      onComplete();
    } catch (error) {
      console.error('Failed to submit grading:', error);
      addToast('提交失败，请重试', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter to show mainly manual grading items, but maybe show context of others?
  // Requirement: "点进去为这类简答题批改赋分" -> focus on manual grading items.
  // But user might want to see context. Let's highlight manual grading items.

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-xl font-bold text-gray-800">
             试卷批改 - {result.username}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
            <div className="mb-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm">
                当前系统自动评分 (非人工项): <span className="font-bold">{result.score}</span> 分<br/>
                合格分数线: {result.passingScore} 分
            </div>

            <div className="space-y-6">
                {attempts.map((attempt, idx) => {
                    if (!attempt.manualGrading) return null; // Only show manual grading items? 
                    // Or maybe show all but disable inputs for non-manual?
                    // Let's show only manual grading items to keep it focused as per requirement.
                    // "点进去为这类简答题批改赋分"
                    
                    return (
                        <div key={idx} className="border border-orange-200 rounded-xl p-4 bg-orange-50">
                            <div className="flex justify-between items-start mb-2">
                                <span className="inline-block px-2 py-1 text-xs font-bold text-orange-700 bg-orange-100 rounded mb-2">
                                    需人工批改
                                </span>
                                <span className="text-sm text-gray-500">
                                    满分: {attempt.maxScore}
                                </span>
                            </div>
                            
                            <div className="mb-3">
                                <h4 className="font-medium text-gray-900 mb-1">题目:</h4>
                                <div className="text-gray-800 rich-text-content ql-editor" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: sanitizeHTML(attempt.questionText) }} />
                                {attempt.questionImageUrls && attempt.questionImageUrls.length > 0 && (
                                    <div className="flex gap-2 mt-2">
                                        {attempt.questionImageUrls.map((url, i) => (
                                            <ImageWithPreview key={i} src={url} alt="题目配图" className="h-20 object-contain rounded border" />
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div className="bg-white p-3 rounded border border-gray-200">
                                    <h5 className="text-xs font-bold text-gray-500 uppercase mb-1">用户回答</h5>
                                    <div className="text-gray-900 whitespace-pre-wrap break-words">{attempt.userAnswer || '(未作答)'}</div>
                                </div>
                                <div className="bg-green-50 p-3 rounded border border-green-100">
                                    <h5 className="text-xs font-bold text-green-700 uppercase mb-1">参考答案</h5>
                                    <div className="text-green-900 rich-text-content ql-editor" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: sanitizeHTML(attempt.correctAnswerText) }} />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 justify-end bg-white p-2 rounded border border-gray-100">
                                <label className="text-sm font-medium text-gray-700">评分:</label>
                                <input 
                                    type="number" 
                                    min="0" 
                                    max={attempt.maxScore}
                                    step="0.5"
                                    value={attempt.score || 0}
                                    onChange={(e) => handleScoreChange(idx, e.target.value)}
                                    className="w-24 px-2 py-1 border rounded focus:ring-2 focus:ring-primary-500 outline-none text-right font-bold"
                                />
                                <span className="text-gray-500">/ {attempt.maxScore}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
             <div className="mr-auto flex items-center text-gray-700">
                <span className="mr-2">预计总分:</span>
                <span className="text-xl font-bold text-primary-600">
                    {attempts.reduce((sum, a) => sum + (a.score || 0), 0)}
                </span>
                <span className="mx-2 text-gray-400">/</span>
                <span>{result.maxScore || result.totalQuestions}</span>
             </div>
             <Button variant="secondary" onClick={onClose}>取消</Button>
             <Button onClick={handleSubmit} isLoading={isSubmitting}>完成批改</Button>
        </div>
      </div>
    </div>
  );
};
