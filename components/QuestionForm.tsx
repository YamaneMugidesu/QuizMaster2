import React, { useState, useEffect, Suspense } from 'react';
import { Question, QuestionType, Difficulty, GradeLevel, QuestionCategory } from '../types';
import { Button } from './Button';
// import { RichTextEditor } from './RichTextEditor';

// Lazy load RichTextEditor to prevent initial bundle crash if Quill fails
const RichTextEditor = React.lazy(() => import('./RichTextEditor').then(module => ({ default: module.RichTextEditor })));

export interface QuestionFormData {
  type: QuestionType;
  text: string;
  imageUrls: string[];
  options: string[];
  correctAnswer: string;
  subject: string;
  difficulty: Difficulty;
  gradeLevel: GradeLevel;
  category: QuestionCategory;
  needsGrading?: boolean;
  explanation?: string;
}

interface QuestionFormProps {
  initialData?: Question;
  onSubmit: (data: QuestionFormData) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '地理', '政治', '历史'];

export const QuestionForm: React.FC<QuestionFormProps> = ({ initialData, onSubmit, onCancel, submitLabel = '保存题目' }) => {
  const [type, setType] = useState<QuestionType>(QuestionType.MULTIPLE_CHOICE);
  const [questionText, setQuestionText] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  
  // Options for Choice/Select questions
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  
  // Answer handling
  const [correctAnswer, setCorrectAnswer] = useState(''); // Single value for basic types
  const [correctOptions, setCorrectOptions] = useState<string[]>([]); // Array for Multiple Select
  const [blankAnswers, setBlankAnswers] = useState<string[]>(['']); // Array for Fill In The Blank

  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.EASY);
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>(GradeLevel.PRIMARY);
  const [category, setCategory] = useState<QuestionCategory>(QuestionCategory.BASIC);
  const [needsGrading, setNeedsGrading] = useState(false);
  const [explanation, setExplanation] = useState('');

  useEffect(() => {
    if (initialData) {
      setType(initialData.type);
      setQuestionText(initialData.text);
      
      const imgs = initialData.imageUrls || ((initialData as any).imageUrl ? [(initialData as any).imageUrl] : []);
      setImageUrls(imgs);

      // Ensure subject is one of the valid ones, or fallback
      setSubject(SUBJECTS.includes(initialData.subject) ? initialData.subject : SUBJECTS[0]);
      setDifficulty(initialData.difficulty || Difficulty.EASY);
      setGradeLevel(initialData.gradeLevel || GradeLevel.PRIMARY);
      setCategory(initialData.category || QuestionCategory.BASIC);
      setNeedsGrading(initialData.needsGrading || false);
      setExplanation(initialData.explanation || '');
      
      if ((initialData.type === QuestionType.MULTIPLE_CHOICE || initialData.type === QuestionType.MULTIPLE_SELECT) && initialData.options) {
        setOptionA(initialData.options[0] || '');
        setOptionB(initialData.options[1] || '');
        setOptionC(initialData.options[2] || '');
        setOptionD(initialData.options[3] || '');
      }

      if (initialData.type === QuestionType.MULTIPLE_SELECT) {
          try {
              setCorrectOptions(JSON.parse(initialData.correctAnswer));
          } catch {
              setCorrectOptions([]);
          }
      } else if (initialData.type === QuestionType.FILL_IN_THE_BLANK) {
          // Try parsing as JSON first (new format), fallback to semicolon split (requested format), or single value
          try {
              const parsed = JSON.parse(initialData.correctAnswer);
              if (Array.isArray(parsed)) {
                  setBlankAnswers(parsed);
              } else {
                  // Fallback if JSON is not array
                  setBlankAnswers([initialData.correctAnswer]);
              }
          } catch {
              // Not JSON, try splitting by semicolon if it looks like a separated list
              // Be careful not to split HTML entities or styles indiscriminately
              // For now, if it's legacy data (single string), just wrap in array
              // If we implement semicolon separation strictly:
              if (initialData.correctAnswer.includes(';&&;')) {
                 setBlankAnswers(initialData.correctAnswer.split(';&&;'));
              } else {
                 setBlankAnswers([initialData.correctAnswer]);
              }
          }
      } else {
          setCorrectAnswer(initialData.correctAnswer);
      }
    }
  }, [initialData]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                setImageUrls(prev => [...prev, dataUrl]);
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
      setImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const toggleCorrectOption = (optValue: string) => {
      if (!optValue) return;
      setCorrectOptions(prev => {
          if (prev.includes(optValue)) {
              return prev.filter(o => o !== optValue);
          } else {
              return [...prev, optValue];
          }
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let options: string[] = [];
    let finalCorrectAnswer = correctAnswer;

    if (type === QuestionType.MULTIPLE_CHOICE || type === QuestionType.MULTIPLE_SELECT) {
      options = [optionA, optionB, optionC, optionD];
    } else if (type === QuestionType.TRUE_FALSE) {
      options = ['正确', '错误'];
    }

    if (type === QuestionType.MULTIPLE_SELECT) {
        finalCorrectAnswer = JSON.stringify(correctOptions.sort());
        if (correctOptions.length === 0) {
            alert("请至少选择一个正确选项");
            return;
        }
    } else if (type === QuestionType.FILL_IN_THE_BLANK) {
        // Filter out empty blanks? Maybe not, user might want to leave placeholders.
        // But we should probably remove trailing empty blanks or just save as is.
        // Let's save as JSON to handle rich text safely.
        finalCorrectAnswer = JSON.stringify(blankAnswers);
        if (blankAnswers.every(b => !b || b.trim() === '' || b === '<p><br></p>')) {
             alert("请至少输入一个填空答案");
             return;
        }
    }

    onSubmit({
      type,
      text: questionText,
      imageUrls,
      options,
      correctAnswer: finalCorrectAnswer,
      subject,
      difficulty,
      gradeLevel,
      category,
      needsGrading: type === QuestionType.SHORT_ANSWER ? needsGrading : false,
      explanation
    });

    if (!initialData) {
        resetForm();
    }
  };

  const resetForm = () => {
    setQuestionText('');
    setImageUrls([]);
    setOptionA('');
    setOptionB('');
    setOptionC('');
    setOptionD('');
    setCorrectAnswer('');
    setCorrectOptions([]);
    setBlankAnswers(['']);
    setSubject(SUBJECTS[0]);
    setDifficulty(Difficulty.EASY);
    setGradeLevel(GradeLevel.PRIMARY);
    setCategory(QuestionCategory.BASIC);
    setExplanation('');
  };

  return (
    <div className="animate-fade-in">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">题目类型</label>
            <select 
              className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
              value={type}
              onChange={(e) => {
                  setType(e.target.value as QuestionType);
                  setCorrectAnswer('');
                  setCorrectOptions([]);
                  setBlankAnswers(['']);
              }}
            >
              <option value={QuestionType.MULTIPLE_CHOICE}>单选题</option>
              <option value={QuestionType.MULTIPLE_SELECT}>多选题</option>
              <option value={QuestionType.TRUE_FALSE}>判断题</option>
              <option value={QuestionType.FILL_IN_THE_BLANK}>填空题</option>
              <option value={QuestionType.SHORT_ANSWER}>简答题</option>
            </select>
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">学科</label>
             <select
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
             >
                {SUBJECTS.map(s => (
                    <option key={s} value={s}>{s}</option>
                ))}
             </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">学段</label>
            <select 
              className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value as GradeLevel)}
            >
              <option value={GradeLevel.PRIMARY}>小学</option>
              <option value={GradeLevel.JUNIOR}>初中</option>
              <option value={GradeLevel.SENIOR}>高中</option>
            </select>
          </div>

           <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">难度</label>
            <select 
              className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              <option value={Difficulty.EASY}>简单</option>
              <option value={Difficulty.MEDIUM}>中等</option>
              <option value={Difficulty.HARD}>困难</option>
            </select>
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">题目分类</label>
             <select
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                value={category}
                onChange={(e) => setCategory(e.target.value as QuestionCategory)}
             >
                <option value={QuestionCategory.BASIC}>基础知识</option>
                <option value={QuestionCategory.MISTAKE}>易错题</option>
                <option value={QuestionCategory.EXPLANATION}>写解析</option>
                <option value={QuestionCategory.STANDARD}>标准理解</option>
             </select>
          </div>
        </div>
          
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">题目内容</label>
            <Suspense fallback={<div className="h-32 w-full bg-gray-100 animate-pulse rounded-md">Loading Editor...</div>}>
                <RichTextEditor 
                  value={questionText}
                  onChange={setQuestionText}
                  placeholder="请输入题目描述..."
                />
            </Suspense>
            {/* <textarea 
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:outline-none h-32"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="请输入题目描述..."
            /> */}
            {type === QuestionType.SHORT_ANSWER && (
                <div className="mt-2 flex items-center">
                    <input 
                        id="needsGrading"
                        type="checkbox"
                        className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                        checked={needsGrading}
                        onChange={(e) => setNeedsGrading(e.target.checked)}
                    />
                    <label htmlFor="needsGrading" className="ml-2 text-sm text-gray-600">
                        需要人工批改 (选中后，用户答题后不直接判分，需管理员在后台批阅)
                    </label>
                </div>
            )}
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">题目配图 (可选，支持多张)</label>
            <div className="flex flex-col gap-4">
                <input 
                    type="file" 
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                
                {imageUrls.length > 0 && (
                    <div className="flex flex-wrap gap-4 mt-2">
                        {imageUrls.map((url, idx) => (
                             <div key={idx} className="relative w-32 h-24 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 group">
                                <img src={url} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                                <button 
                                    type="button" 
                                    onClick={() => removeImage(idx)}
                                    className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

          {(type === QuestionType.MULTIPLE_CHOICE || type === QuestionType.MULTIPLE_SELECT) && (
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="text-sm font-semibold text-gray-600 mb-3 border-b pb-2">
                    选项设置 & 正确答案
                    <span className="text-xs font-normal ml-2 text-gray-400">
                        {type === QuestionType.MULTIPLE_SELECT ? '(勾选所有正确选项)' : '(请在下方选择一个正确答案)'}
                    </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                        { val: optionA, set: setOptionA, label: 'A' },
                        { val: optionB, set: setOptionB, label: 'B' },
                        { val: optionC, set: setOptionC, label: 'C' },
                        { val: optionD, set: setOptionD, label: 'D' }
                    ].map((opt, i) => (
                        <div key={i} className="flex flex-col gap-2">
                            <span className="font-bold text-gray-500">选项 {opt.label}</span>
                            <Suspense fallback={<div className="h-32 w-full bg-gray-100 animate-pulse rounded-md">Loading...</div>}>
                                <RichTextEditor 
                                    value={opt.val}
                                    onChange={opt.set}
                                    placeholder={`请输入选项 ${opt.label} 内容`}
                                />
                            </Suspense>
                            {type === QuestionType.MULTIPLE_SELECT && (
                                <div className="flex items-center mt-2">
                                    <input 
                                        type="checkbox" 
                                        id={`correct-${opt.label}`}
                                        checked={correctOptions.includes(opt.val) && opt.val !== ''}
                                        disabled={!opt.val}
                                        onChange={() => toggleCorrectOption(opt.val)}
                                        className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                                    />
                                    <label htmlFor={`correct-${opt.label}`} className="ml-2 text-sm text-gray-700 cursor-pointer">
                                        设为正确答案
                                    </label>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
               正确答案设定
            </label>
            
            {type === QuestionType.TRUE_FALSE && (
               <select 
               className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
               value={correctAnswer}
               onChange={(e) => setCorrectAnswer(e.target.value)}
             >
               <option value="">请选择...</option>
               <option value="正确">正确</option>
               <option value="错误">错误</option>
             </select>
            )}

            {type === QuestionType.MULTIPLE_CHOICE && (
                <select 
                    className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(e.target.value)}
                >
                    <option value="">请选择正确选项...</option>
                    {/* Render options stripped of HTML tags for readability in dropdown */}
                    {optionA && <option value={optionA}>A: {optionA.replace(/<[^>]+>/g, '')}</option>}
                    {optionB && <option value={optionB}>B: {optionB.replace(/<[^>]+>/g, '')}</option>}
                    {optionC && <option value={optionC}>C: {optionC.replace(/<[^>]+>/g, '')}</option>}
                    {optionD && <option value={optionD}>D: {optionD.replace(/<[^>]+>/g, '')}</option>}
                </select>
            )}

            {type === QuestionType.MULTIPLE_SELECT && (
                <div className="p-3 bg-primary-50 border border-primary-100 rounded-md text-sm text-primary-800">
                     已选正确答案: {correctOptions.length > 0 ? correctOptions.map(o => o.replace(/<[^>]+>/g, '')).join('、') : '(请在上方选项旁勾选)'}
                </div>
            )}

            {type === QuestionType.SHORT_ANSWER && (
              <Suspense fallback={<div className="h-32 w-full bg-gray-100 animate-pulse rounded-md">Loading Editor...</div>}>
                  <RichTextEditor 
                    value={correctAnswer}
                    onChange={setCorrectAnswer}
                    placeholder="请输入参考答案"
                  />
              </Suspense>
            )}

            {type === QuestionType.FILL_IN_THE_BLANK && (
                <div className="space-y-4">
                    {blankAnswers.map((ans, index) => (
                        <div key={index} className="relative p-4 bg-gray-50 border border-gray-200 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium text-gray-700">填空 {index + 1}</label>
                                {blankAnswers.length > 1 && (
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const newBlanks = [...blankAnswers];
                                            newBlanks.splice(index, 1);
                                            setBlankAnswers(newBlanks);
                                        }}
                                        className="text-red-500 hover:text-red-700 text-sm"
                                    >
                                        删除此空
                                    </button>
                                )}
                            </div>
                            <Suspense fallback={<div className="h-32 w-full bg-gray-100 animate-pulse rounded-md">Loading Editor...</div>}>
                                <RichTextEditor 
                                    value={ans}
                                    onChange={(val) => {
                                        const newBlanks = [...blankAnswers];
                                        newBlanks[index] = val;
                                        setBlankAnswers(newBlanks);
                                    }}
                                    placeholder={`请输入填空 ${index + 1} 的标准答案`}
                                />
                            </Suspense>
                        </div>
                    ))}
                    <Button 
                        type="button" 
                        variant="secondary"
                        onClick={() => setBlankAnswers([...blankAnswers, ''])}
                        className="w-full border-dashed border-2 border-gray-300 text-gray-500 hover:border-primary-500 hover:text-primary-500 flex justify-center items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        添加填空 (点击增加一空)
                    </Button>
                </div>
            )}
          </div>

          <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">答案解析 (可选)</label>
               <Suspense fallback={<div className="h-32 w-full bg-gray-100 animate-pulse rounded-md">Loading Editor...</div>}>
                   <RichTextEditor 
                     value={explanation}
                     onChange={setExplanation}
                     placeholder="请输入答案解析，帮助考生理解正确答案..."
                   />
               </Suspense>
               {/* <textarea 
                    className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:outline-none h-32"
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder="请输入答案解析，帮助考生理解正确答案..."
                /> */}
           </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-6">
          {onCancel && (
             <Button type="button" variant="secondary" onClick={onCancel}>
               取消
             </Button>
          )}
          <Button type="submit">{submitLabel}</Button>
        </div>
      </form>
    </div>
  );
};