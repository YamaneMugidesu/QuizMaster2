
import React, { useState, useEffect } from 'react';
import { Question, QuestionType, QuizAttempt, QuizResult } from '../types';
import { generateQuiz } from '../services/storageService';
import { Button } from './Button';

interface QuizTakerProps {
  configId: string;
  onComplete: (result: QuizResult) => void;
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
  const startTime = React.useRef<number>(Date.now());

  useEffect(() => {
    const load = async () => {
        // Load quiz based on specific configuration ID
        const { questions: quizQuestions, configName: name, passingScore: pScore } = await generateQuiz(configId); 
        setQuestions(quizQuestions);
        setConfigName(name);
        setPassingScore(pScore);
        setIsLoading(false);
    };
    load();
  }, [configId]);

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
    let score = 0;
    let maxScore = 0;
    const attempts: QuizAttempt[] = [];
    let hasPendingGrading = false;

    questions.forEach(q => {
      const userAnswer = answers[q.id] || '';
      let isCorrect = false;
      const questionPoints = q.score || 1;
      maxScore += questionPoints;

      if (q.type === QuestionType.SHORT_ANSWER && q.needsGrading) {
          hasPendingGrading = true;
          isCorrect = false; // Mark as false for now, will be graded later
      } else if (q.type === QuestionType.MULTIPLE_SELECT) {
          try {
             const userArr = JSON.parse(userAnswer || '[]');
             const correctArr = JSON.parse(q.correctAnswer);
             userArr.sort();
             correctArr.sort();
             isCorrect = JSON.stringify(userArr) === JSON.stringify(correctArr);
          } catch {
              isCorrect = false;
          }
      } else {
          if (q.type === QuestionType.MULTIPLE_CHOICE || q.type === QuestionType.TRUE_FALSE) {
              // For selection types, compare raw values (including HTML)
              // This is crucial because the options contain HTML and correct answer is one of them
              isCorrect = userAnswer === q.correctAnswer;
          } else {
              // For text input types (Fill in blank, Short answer auto-grade)
              
              if (q.type === QuestionType.FILL_IN_THE_BLANK) {
                  // Handle Multi-Blank Logic
                  let correctParts: string[] = [];
                  let userParts: string[] = [];

                  // Parse Correct Answer
                  try {
                      const parsed = JSON.parse(q.correctAnswer);
                      if (Array.isArray(parsed)) correctParts = parsed;
                      else correctParts = [q.correctAnswer];
                  } catch {
                      // Fallback for semicolon (if implemented) or single string
                      if (q.correctAnswer.includes(';&&;')) correctParts = q.correctAnswer.split(';&&;');
                      else correctParts = [q.correctAnswer];
                  }

                  // Parse User Answer
                  try {
                      const parsed = JSON.parse(userAnswer || '[]');
                      if (Array.isArray(parsed)) userParts = parsed;
                      else userParts = userAnswer ? [userAnswer] : [];
                  } catch {
                      userParts = userAnswer ? [userAnswer] : [];
                  }

                  // Compare each part
                  // We assume order matters
                  if (userParts.length !== correctParts.length) {
                      isCorrect = false; // Count mismatch
                  } else {
                      isCorrect = correctParts.every((cPart, idx) => {
                          const uPart = userParts[idx] || '';
                          // Strip HTML from correct answer part for comparison
                          const cleanCorrect = cPart.replace(/<[^>]+>/g, '').trim().toLowerCase();
                          const cleanUser = uPart.trim().toLowerCase();
                          return cleanUser === cleanCorrect;
                      });
                  }

              } else {
                  // Short Answer Auto-Grade (Single)
                  const cleanCorrectAnswer = q.correctAnswer.replace(/<[^>]+>/g, '').trim().toLowerCase();
                  const cleanUserAnswer = userAnswer.trim().toLowerCase();
                  isCorrect = cleanUserAnswer === cleanCorrectAnswer;
              }
          }
      }

      if (isCorrect) score += questionPoints;
      
      attempts.push({
        questionId: q.id,
        userAnswer,
        isCorrect,
        questionText: q.text,
        questionImageUrls: q.imageUrls || ((q as any).imageUrl ? [(q as any).imageUrl] : []),
        correctAnswerText: q.correctAnswer,
        score: isCorrect ? questionPoints : 0,
        maxScore: questionPoints,
        manualGrading: q.needsGrading
      });
    });

    const result: any = {
      score,
      maxScore,
      passingScore, // Save snapshot of passing score
      isPassed: !hasPendingGrading && score >= passingScore, // Determine status
      totalQuestions: questions.length,
      attempts,
      configId: configId,
      configName: configName,
      status: hasPendingGrading ? 'pending_grading' : 'completed',
      duration: Math.floor((Date.now() - startTime.current) / 1000) // Duration in seconds
    };

    onComplete(result);
    setIsSubmitting(false);
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
  const progress = ((currentIdx + 1) / questions.length) * 100;
  const currentAnswer = answers[currentQ.id] || '';

  let selectedOptions: string[] = [];
  if (currentQ.type === QuestionType.MULTIPLE_SELECT) {
      try {
          selectedOptions = JSON.parse(currentAnswer || '[]');
      } catch {}
  }

  // Calculate Blank Count and Current Blank Answers for Fill-in-the-blank
  let blankCount = 1;
  let currentBlankAnswers: string[] = [];
  
  if (currentQ.type === QuestionType.FILL_IN_THE_BLANK) {
      try {
          const parsed = JSON.parse(currentQ.correctAnswer);
          if (Array.isArray(parsed)) blankCount = parsed.length;
          else blankCount = 1;
      } catch {
          if (currentQ.correctAnswer && currentQ.correctAnswer.includes(';&&;')) {
              blankCount = currentQ.correctAnswer.split(';&&;').length;
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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 bg-gray-200 rounded-full h-2.5">
        <div className="bg-primary-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
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
                    <img 
                        key={idx}
                        src={img} 
                        alt={`Question Image ${idx}`} 
                        className="max-h-64 object-contain rounded-lg border border-gray-200 shadow-sm flex-shrink-0"
                    />
                 ))}
             </div>
          )}

          <h2 
            className="text-2xl font-bold text-gray-900 mb-8 ql-editor rich-text-content" 
            style={{ padding: 0 }}
            dangerouslySetInnerHTML={{ __html: currentQ.text }} 
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
                          <span className="ml-3 font-medium text-gray-700 rich-text-content" dangerouslySetInnerHTML={{ __html: opt }} />
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
                                <span className="ml-3 font-medium text-gray-700 rich-text-content" dangerouslySetInnerHTML={{ __html: opt }} />
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
                    <input 
                        type="text" 
                        className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0 outline-none text-lg"
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
      
      <div className="mt-4 text-center">
        <button onClick={onExit} className="text-gray-400 hover:text-gray-600 text-sm underline">放弃并退出</button>
      </div>
    </div>
  );
};
