
import React, { useState, useEffect } from 'react';
import { QuizConfig, QuizPartConfig, Difficulty, QuestionType, GradeLevel, QuestionCategory } from '../types';
import { getQuizConfigs, saveQuizConfig, deleteQuizConfig, getAvailableQuestionCount } from '../services/storageService';
import { Button } from './Button';

interface QuizConfigFormProps {
    onSave?: () => void;
}

const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '地理', '政治', '历史'];
const GRADES = [
    { label: '小学', value: GradeLevel.PRIMARY },
    { label: '初中', value: GradeLevel.JUNIOR },
    { label: '高中', value: GradeLevel.SENIOR },
];
const DIFFICULTIES = [
    { label: '简单', value: Difficulty.EASY },
    { label: '中等', value: Difficulty.MEDIUM },
    { label: '困难', value: Difficulty.HARD },
];
const TYPES = [
    { label: '单选', value: QuestionType.MULTIPLE_CHOICE },
    { label: '多选', value: QuestionType.MULTIPLE_SELECT },
    { label: '判断', value: QuestionType.TRUE_FALSE },
    { label: '填空', value: QuestionType.FILL_IN_THE_BLANK },
    { label: '简答', value: QuestionType.SHORT_ANSWER },
];
const CATEGORIES = [
    { label: '基础知识', value: QuestionCategory.BASIC },
    { label: '易错题', value: QuestionCategory.MISTAKE },
    { label: '写解析', value: QuestionCategory.EXPLANATION },
    { label: '标准理解', value: QuestionCategory.STANDARD },
];

export const QuizConfigForm: React.FC<QuizConfigFormProps> = ({ onSave }) => {
    const [configs, setConfigs] = useState<QuizConfig[]>([]);
    const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
    const [activeConfig, setActiveConfig] = useState<QuizConfig | null>(null);
    const [availability, setAvailability] = useState<number[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadConfigs();
    }, []);

    useEffect(() => {
        if (selectedConfigId) {
            const found = configs.find(c => c.id === selectedConfigId);
            if (found) {
                // Ensure legacy support
                if (found.passingScore === undefined) found.passingScore = 0;
                setActiveConfig(found);
                checkAvailability(found.parts);
            }
        } else {
            setActiveConfig(null);
            setAvailability([]);
        }
    }, [selectedConfigId, configs]);

    const loadConfigs = async () => {
        const list = await getQuizConfigs();
        setConfigs(list);
        if (list.length > 0 && !selectedConfigId) {
            setSelectedConfigId(list[0].id);
        }
    };

    const handleCreateConfig = async () => {
        const newConfig: QuizConfig = {
            id: Math.random().toString(36).substr(2, 9),
            name: '新试卷配置',
            description: '这是一份新的试卷配置',
            totalQuestions: 0,
            passingScore: 0,
            createdAt: Date.now(),
            parts: [],
            quizMode: 'practice'
        };
        await saveQuizConfig(newConfig);
        await loadConfigs();
        setSelectedConfigId(newConfig.id);
    };

    const handleDeleteConfig = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('确定要删除这份试卷配置吗？')) {
            await deleteQuizConfig(id);
            const remaining = configs.filter(c => c.id !== id);
            setConfigs(remaining);
            if (selectedConfigId === id) {
                setSelectedConfigId(remaining.length > 0 ? remaining[0].id : null);
            }
        }
    };

    const checkAvailability = async (parts: QuizPartConfig[]) => {
        // We can run these in parallel
        const promises = parts.map(part => 
             getAvailableQuestionCount(part.subjects, part.difficulties, part.gradeLevels, part.questionTypes, part.categories)
        );
        const counts = await Promise.all(promises);
        setAvailability(counts);
    };

    // --- Editor Logic ---

    const updateMeta = (field: 'name' | 'description', value: string) => {
        if (!activeConfig) return;
        const updated = { ...activeConfig, [field]: value };
        setActiveConfig(updated);
    };

    const updateQuizMode = (mode: 'practice' | 'exam') => {
        if (!activeConfig) return;
        const updated = { ...activeConfig, quizMode: mode };
        setActiveConfig(updated);
    };

    const updatePassingScore = (val: number) => {
        if (!activeConfig) return;
        const updated = { ...activeConfig, passingScore: val };
        setActiveConfig(updated);
    };

    const updatePart = (index: number, field: keyof QuizPartConfig, value: any) => {
        if (!activeConfig) return;
        const newParts = [...activeConfig.parts];
        newParts[index] = { ...newParts[index], [field]: value };
        
        const total = newParts.reduce((sum, part) => sum + Number(part.count), 0);
        const updatedConfig = { ...activeConfig, parts: newParts, totalQuestions: total };
        setActiveConfig(updatedConfig);
        // Debounce or just call checkAvailability
        checkAvailability(newParts);
    };

    const toggleArrayItem = (partIndex: number, field: keyof QuizPartConfig, item: any) => {
        if (!activeConfig) return;
        const part = activeConfig.parts[partIndex];
        const currentList = (part[field] as any[]) || [];
        let newList;
        if (currentList.includes(item)) {
            newList = currentList.filter(i => i !== item);
        } else {
            newList = [...currentList, item];
        }
        updatePart(partIndex, field, newList);
    };

    const addPart = () => {
        if (!activeConfig) return;
        const newPart: QuizPartConfig = {
            id: Math.random().toString(36).substr(2, 9),
            name: `部分 ${activeConfig.parts.length + 1}`,
            subjects: [],
            difficulties: [],
            gradeLevels: [],
            questionTypes: [],
            categories: [],
            count: 1,
            score: 1
        };
        const newParts = [...activeConfig.parts, newPart];
        const total = newParts.reduce((sum, part) => sum + Number(part.count), 0);
        const updatedConfig = { ...activeConfig, parts: newParts, totalQuestions: total };
        setActiveConfig(updatedConfig);
        checkAvailability(newParts);
    };

    const removePart = (index: number) => {
        if (!activeConfig) return;
        const newParts = activeConfig.parts.filter((_, i) => i !== index);
        const total = newParts.reduce((sum, part) => sum + Number(part.count), 0);
        const updatedConfig = { ...activeConfig, parts: newParts, totalQuestions: total };
        setActiveConfig(updatedConfig);
        checkAvailability(newParts);
    };

    const handleSave = async () => {
        if (!activeConfig) return;
        
        // Calculate Max Score to validate passing score
        const maxScore = activeConfig.parts.reduce((sum, part) => sum + (part.count * part.score), 0);
        if (activeConfig.passingScore > maxScore) {
            alert(`合格分数 (${activeConfig.passingScore}) 不能超过试卷满分 (${maxScore})。`);
            return;
        }

        // Validate Inventory
        for (let i = 0; i < activeConfig.parts.length; i++) {
            if (activeConfig.parts[i].count > availability[i]) {
                alert(`"${activeConfig.parts[i].name}" 请求的题目数量 (${activeConfig.parts[i].count}) 超过了题库中现有的符合条件题目数 (${availability[i]})。请调整配置。`);
                return;
            }
        }
        setIsSaving(true);
        await saveQuizConfig(activeConfig);
        // Update list specifically to reflect name changes etc.
        await loadConfigs();
        setIsSaving(false);
        alert('试卷配置已保存！');
        if (onSave) onSave();
    };

    // --- UI Render Helpers ---
    
    const renderToggleGroup = (label: string, options: {label: string, value: any}[], partIndex: number, field: keyof QuizPartConfig) => {
        if (!activeConfig) return null;
        const selectedValues = (activeConfig.parts[partIndex][field] as any[]) || [];
        const isAllSelected = selectedValues.length === 0;

        return (
            <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label} <span className="text-gray-400 font-normal scale-90 inline-block">(多选，不选默认为全部)</span></label>
                <div className="flex flex-wrap gap-2">
                     <button
                        type="button"
                        onClick={() => updatePart(partIndex, field, [])}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${isAllSelected ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                    >
                        全部 / 不限
                    </button>
                    {options.map(opt => {
                        const isSelected = selectedValues.includes(opt.value);
                        return (
                            <button
                                key={String(opt.value)}
                                type="button"
                                onClick={() => toggleArrayItem(partIndex, field, opt.value)}
                                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${isSelected ? 'bg-primary-100 text-primary-700 border-primary-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                            >
                                {opt.label}
                            </button>
                        )
                    })}
                </div>
            </div>
        );
    };

    const renderSubjectToggleGroup = (partIndex: number) => {
        if (!activeConfig) return null;
        const field = 'subjects';
        const selectedValues = activeConfig.parts[partIndex].subjects || [];
        const isAllSelected = selectedValues.length === 0;

        return (
             <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">学科限制 <span className="text-gray-400 font-normal scale-90 inline-block">(多选)</span></label>
                <div className="flex flex-wrap gap-2">
                     <button
                        type="button"
                        onClick={() => updatePart(partIndex, field, [])}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${isAllSelected ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                    >
                        全部
                    </button>
                    {SUBJECTS.map(sub => {
                        const isSelected = selectedValues.includes(sub);
                        return (
                            <button
                                key={sub}
                                type="button"
                                onClick={() => toggleArrayItem(partIndex, field, sub)}
                                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${isSelected ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                            >
                                {sub}
                            </button>
                        )
                    })}
                </div>
            </div>
        )
    };

    // Calculate current max score for reference
    const currentMaxScore = activeConfig ? activeConfig.parts.reduce((sum, part) => sum + (part.count * part.score), 0) : 0;

    return (
        <div className="flex flex-col md:flex-row gap-6 animate-fade-in min-h-[600px]">
            {/* Sidebar: Exam List */}
            <div className="w-full md:w-1/4 bg-white rounded-xl shadow border border-gray-100 flex flex-col max-h-[700px]">
                <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-gray-800">试卷列表</h3>
                        <Button variant="ghost" className="p-1 text-primary-600" onClick={handleCreateConfig} title="新建试卷">
                           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                        </Button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {configs.map(c => (
                        <div 
                            key={c.id} 
                            onClick={() => setSelectedConfigId(c.id)}
                            className={`p-3 rounded-lg cursor-pointer border transition-all group relative ${selectedConfigId === c.id ? 'bg-primary-50 border-primary-200 shadow-sm' : 'bg-white border-transparent hover:bg-gray-50 hover:border-gray-200'}`}
                        >
                            <h4 className={`font-bold text-sm mb-1 ${selectedConfigId === c.id ? 'text-primary-800' : 'text-gray-700'}`}>{c.name}</h4>
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-400">{c.totalQuestions} 道题</span>
                                <button 
                                    onClick={(e) => handleDeleteConfig(c.id, e)}
                                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Panel: Editor */}
            <div className="w-full md:w-3/4 bg-white rounded-xl shadow border border-gray-100 flex flex-col overflow-hidden max-h-[700px]">
                {activeConfig ? (
                    <>
                        <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50">
                            <div className="flex-1 mr-8">
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">试卷名称</label>
                                <input 
                                    type="text" 
                                    className="text-2xl font-bold text-gray-800 bg-transparent border-none focus:ring-0 w-full p-0 placeholder-gray-300"
                                    value={activeConfig.name}
                                    onChange={(e) => updateMeta('name', e.target.value)}
                                    placeholder="请输入试卷名称"
                                />
                                <input 
                                    type="text" 
                                    className="mt-2 text-sm text-gray-500 bg-transparent border-none focus:ring-0 w-full p-0 placeholder-gray-300"
                                    value={activeConfig.description || ''}
                                    onChange={(e) => updateMeta('description', e.target.value)}
                                    placeholder="添加试卷描述..."
                                />
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="bg-white px-3 py-1 rounded border border-gray-200 text-center min-w-[100px]">
                                        <div className="text-xs text-gray-500 mb-1">试卷类型</div>
                                        <div className="flex bg-gray-100 rounded p-0.5 justify-center">
                                            <button 
                                                onClick={() => updateQuizMode('practice')}
                                                className={`px-2 py-0.5 text-xs rounded transition-all ${activeConfig.quizMode !== 'exam' ? 'bg-white shadow-sm text-primary-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
                                                title="答完后可查看详细解析"
                                            >
                                                练习
                                            </button>
                                            <button 
                                                onClick={() => updateQuizMode('exam')}
                                                className={`px-2 py-0.5 text-xs rounded transition-all ${activeConfig.quizMode === 'exam' ? 'bg-white shadow-sm text-red-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
                                                title="答完后仅显示分数"
                                            >
                                                正式
                                            </button>
                                        </div>
                                    </div>
                                    <div className="bg-white px-3 py-1 rounded border border-gray-200 text-center">
                                        <div className="text-xs text-gray-500">合格分数</div>
                                        <input 
                                            type="number" 
                                            min="0"
                                            className="w-16 font-bold text-primary-600 text-center border-b border-gray-300 focus:outline-none focus:border-primary-500" 
                                            value={activeConfig.passingScore}
                                            onChange={(e) => updatePassingScore(parseInt(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="bg-white px-3 py-1 rounded border border-gray-200 text-center">
                                        <div className="text-xs text-gray-500">卷面满分</div>
                                        <div className="font-bold text-gray-700">{currentMaxScore}</div>
                                    </div>
                                </div>
                                <Button onClick={handleSave} className="shadow-sm py-1.5 text-sm" isLoading={isSaving}>保存配置</Button>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                             {activeConfig.parts.length === 0 && (
                                 <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                                     暂无试题部分，请点击下方按钮添加。
                                 </div>
                             )}
                             
                             <div className="space-y-6">
                                {activeConfig.parts.map((part, index) => (
                                    <div key={part.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                                        <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                                            <div className="flex items-center gap-3 flex-1">
                                                <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2 py-1 rounded">PART {index + 1}</span>
                                                <input 
                                                    type="text"
                                                    className="bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none px-1 py-0.5 text-sm font-bold text-gray-700 transition-colors"
                                                    value={part.name}
                                                    onChange={(e) => updatePart(index, 'name', e.target.value)}
                                                    placeholder="部分名称"
                                                />
                                            </div>
                                            <button onClick={() => removePart(index)} className="text-gray-300 hover:text-red-500 p-1">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                            <div className="lg:col-span-8">
                                                {renderSubjectToggleGroup(index)}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                                                    {renderToggleGroup('学段限制', GRADES, index, 'gradeLevels')}
                                                    {renderToggleGroup('难度限制', DIFFICULTIES, index, 'difficulties')}
                                                </div>
                                                {renderToggleGroup('题型限制', TYPES, index, 'questionTypes')}
                                                {renderToggleGroup('分类限制', CATEGORIES, index, 'categories')}
                                            </div>
                                            <div className="lg:col-span-4 flex flex-col gap-4 border-l border-gray-100 lg:pl-6">
                                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                                                    <div className="mb-3">
                                                        <label className="block text-xs font-semibold text-gray-500 mb-1">单题分值</label>
                                                        <div className="flex items-center">
                                                            <input type="number" min="0.5" step="0.5" className="w-full px-3 py-2 border rounded text-sm" value={part.score} onChange={(e) => updatePart(index, 'score', parseFloat(e.target.value) || 0)} />
                                                            <span className="ml-2 text-xs text-gray-500">分</span>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-gray-500 mb-1">抽取数量</label>
                                                        <div className="flex items-center">
                                                            <input type="number" min="1" max="50" className="w-full px-3 py-2 border rounded text-sm font-bold text-gray-800" value={part.count} onChange={(e) => updatePart(index, 'count', parseInt(e.target.value) || 1)} />
                                                            <span className="ml-2 text-xs text-gray-500">道</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`flex-1 flex flex-col justify-center items-center rounded-lg border-2 border-dashed p-2 ${availability[index] < part.count ? 'border-red-200 bg-red-50' : 'border-green-100 bg-green-50'}`}>
                                                    <div className={`text-center ${availability[index] < part.count ? 'text-red-600' : 'text-green-600'}`}>
                                                        <span className="block text-xs font-semibold opacity-70 mb-1">匹配库存</span>
                                                        <span className="text-2xl font-bold">{availability[index]}</span>
                                                    </div>
                                                    {availability[index] < part.count && <div className="mt-1 text-xs text-red-500 font-bold">库存不足</div>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <Button variant="secondary" onClick={addPart} className="w-full border-dashed py-3">
                                    + 添加新部分
                                </Button>
                             </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400 flex-col">
                        <svg className="w-16 h-16 mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <p>请从左侧选择或新建一份试卷配置</p>
                    </div>
                )}
            </div>
        </div>
    );
};
