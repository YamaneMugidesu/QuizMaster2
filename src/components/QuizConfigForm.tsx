
import React, { useState, useEffect } from 'react';
import { QuizConfig, QuizPartConfig, Difficulty, QuestionType, GradeLevel, QuestionCategory, SUBJECTS } from '../types';
import { saveQuizConfig, deleteQuizConfig, getAvailableQuestionCount, toggleQuizConfigVisibility, restoreQuizConfig, hardDeleteQuizConfig } from '../services/storageService';
import { useQuizConfigs, mutateQuizConfigs } from '../hooks/useData';
import { Button } from './Button';
import { useToast } from './Toast';

interface QuizConfigFormProps {
    onSave?: () => void;
}

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
    const [showRecycleBin, setShowRecycleBin] = useState(false);
    const { configs, isLoading: isConfigsLoading, mutate } = useQuizConfigs(true, false, showRecycleBin);
    const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
    const [activeConfig, setActiveConfig] = useState<QuizConfig | null>(null);
    const [availability, setAvailability] = useState<number[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const { addToast } = useToast();

    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await mutate();
            addToast('刷新成功', 'success');
        } catch (error) {
            console.error('Refresh failed:', error);
            addToast('刷新失败', 'error');
        } finally {
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        if (configs.length > 0) {
            if (!selectedConfigId || !configs.find(c => c.id === selectedConfigId)) {
                setSelectedConfigId(configs[0].id);
            }
        } else {
            setSelectedConfigId(null);
        }
    }, [configs, selectedConfigId]);

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

    const handleCreateConfig = async () => {
        setIsCreating(true);
        try {
            const newConfig: QuizConfig = {
                // Fix: Use UUID for ID to match database schema (uuid type)
                id: crypto.randomUUID(),
                name: '新试卷配置',
                description: '这是一份新的试卷配置',
                totalQuestions: 0,
                passingScore: 0,
                createdAt: Date.now(),
                parts: [],
                quizMode: 'practice'
            };
            await saveQuizConfig(newConfig);
            mutateQuizConfigs();
            setSelectedConfigId(newConfig.id);
            addToast('新试卷配置已创建', 'success');
        } catch (error) {
            console.error('Failed to create config:', error);
            addToast('创建失败，请重试', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteConfig = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('确定要删除这份试卷配置吗？')) {
            setProcessingId(id);
            try {
                await deleteQuizConfig(id);
                mutateQuizConfigs();
                const remaining = configs.filter(c => c.id !== id);
                if (selectedConfigId === id) {
                    setSelectedConfigId(remaining.length > 0 ? remaining[0].id : null);
                }
                addToast('试卷配置已删除', 'success');
            } catch (error) {
                console.error('Failed to delete config:', error);
                addToast('删除失败，请重试', 'error');
            } finally {
                setProcessingId(null);
            }
        }
    };

    const handleRestoreConfig = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setProcessingId(id);
        try {
            await restoreQuizConfig(id);
            mutateQuizConfigs();
            // Don't need to manually update selectedConfigId here as useEffect handles it, 
            // but for immediate feedback we might want to switch if current one disappears from list?
            // Actually, if we restore, it disappears from "Deleted" list.
            const remaining = configs.filter(c => c.id !== id);
            if (selectedConfigId === id) {
                setSelectedConfigId(remaining.length > 0 ? remaining[0].id : null);
            }
            addToast('试卷配置已恢复', 'success');
        } catch (error) {
            console.error('Failed to restore config:', error);
            addToast('恢复失败，请重试', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const handleHardDeleteConfig = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('确定要永久删除这份试卷配置吗？此操作无法撤销！')) {
            setProcessingId(id);
            try {
                await hardDeleteQuizConfig(id);
                mutateQuizConfigs();
                const remaining = configs.filter(c => c.id !== id);
                if (selectedConfigId === id) {
                    setSelectedConfigId(remaining.length > 0 ? remaining[0].id : null);
                }
                addToast('试卷配置已永久删除', 'success');
            } catch (error) {
                console.error('Failed to hard delete config:', error);
                addToast('删除失败，请重试', 'error');
            } finally {
                setProcessingId(null);
            }
        }
    };

    const handleTogglePublish = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setProcessingId(id);
        try {
            await toggleQuizConfigVisibility(id);
            mutateQuizConfigs();
            addToast('状态已更新', 'success');
        } catch (error) {
            console.error('Failed to toggle publish status:', error);
            addToast('状态更新失败', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const checkAvailability = async (parts: QuizPartConfig[]) => {
        try {
            // We can run these in parallel
            const promises = parts.map(part => 
                 getAvailableQuestionCount(part.subjects, part.difficulties, part.gradeLevels, part.questionTypes, part.categories)
            );
            const counts = await Promise.all(promises);
            setAvailability(counts);
        } catch (error) {
            console.error('Failed to check availability:', error);
            // Don't show toast here as it might spam the user while typing/editing
            // But maybe set availability to 0 or indicator error
        }
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
            addToast(`合格分数 (${activeConfig.passingScore}) 不能超过试卷满分 (${maxScore})。`, 'warning');
            return;
        }

        // Validate Inventory
        for (let i = 0; i < activeConfig.parts.length; i++) {
            if (activeConfig.parts[i].count > availability[i]) {
                addToast(`"${activeConfig.parts[i].name}" 请求的题目数量 (${activeConfig.parts[i].count}) 超过了题库中现有的符合条件题目数 (${availability[i]})。请调整配置。`, 'warning');
                return;
            }
        }
        setIsSaving(true);
        try {
            await saveQuizConfig(activeConfig);
            mutateQuizConfigs();
            addToast('配置保存成功', 'success');
            if (onSave) onSave();
        } catch (error) {
            console.error(error);
            addToast('保存失败', 'error');
        } finally {
            setIsSaving(false);
        }
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
                        <h3 className="font-bold text-gray-800">
                            {showRecycleBin ? '试卷回收站' : '试卷列表'}
                        </h3>
                        <div className="flex gap-1">
                            <button 
                                onClick={() => setShowRecycleBin(!showRecycleBin)}
                                className={`p-1 rounded hover:bg-gray-200 transition-colors ${showRecycleBin ? 'text-red-600 bg-red-50' : 'text-gray-400'}`}
                                title={showRecycleBin ? "返回列表" : "回收站"}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                            {!showRecycleBin && (
                                <Button variant="ghost" className="p-1 text-primary-600" onClick={handleCreateConfig} title="新建试卷" disabled={isCreating}>
                                    {isCreating ? (
                                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                    )}
                                </Button>
                            )}
                            <Button variant="ghost" className="p-1 text-primary-600" onClick={handleRefresh} disabled={isRefreshing} title="刷新列表">
                                <svg className={`w-5 h-5 ${isConfigsLoading || isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </Button>
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {configs.map(c => (
                        <div 
                            key={c.id} 
                            onClick={() => !processingId && setSelectedConfigId(c.id)}
                            className={`p-3 rounded-lg cursor-pointer border transition-all group relative ${selectedConfigId === c.id ? 'bg-primary-50 border-primary-200 shadow-sm' : 'bg-white border-transparent hover:bg-gray-50 hover:border-gray-200'} ${processingId === c.id ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                            <h4 className={`font-bold text-sm mb-1 ${selectedConfigId === c.id ? 'text-primary-800' : 'text-gray-700'}`}>
                                {c.name}
                                {!c.isPublished && <span className="ml-2 text-xs font-normal text-red-500 bg-red-50 px-1 py-0.5 rounded">已下架</span>}
                            </h4>
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-400">{c.totalQuestions} 道题</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {processingId === c.id ? (
                                        <svg className="w-4 h-4 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : (
                                        <>
                                            {showRecycleBin ? (
                                                <>
                                                    <button 
                                                        onClick={(e) => handleRestoreConfig(c.id, e)}
                                                        className="text-green-500 hover:text-green-700 p-1"
                                                        title="恢复"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleHardDeleteConfig(c.id, e)}
                                                        className="text-red-400 hover:text-red-600 p-1"
                                                        title="永久删除"
                                                    >
                                                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={(e) => handleTogglePublish(c.id, e)}
                                                        className={`p-1 hover:bg-gray-100 rounded ${c.isPublished ? 'text-green-500' : 'text-gray-400'}`}
                                                        title={c.isPublished ? "点击下架" : "点击上架"}
                                                    >
                                                        {c.isPublished ? (
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleDeleteConfig(c.id, e)}
                                                        className="text-gray-300 hover:text-red-500 p-1"
                                                        title="删除"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Panel: Editor */}
            <div className="w-full md:w-3/4 bg-white rounded-xl shadow border border-gray-100 flex flex-col overflow-hidden max-h-[700px]">
                {activeConfig ? (
                    showRecycleBin ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-10 text-center animate-fade-in">
                            <div className="bg-red-50 p-6 rounded-full mb-4">
                                <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">此试卷配置已删除</h3>
                            <p className="text-gray-500 mb-6 max-w-md">
                                您正在查看回收站中的试卷配置 "{activeConfig.name}"。<br/>
                                如果需要编辑或使用此配置，请先将其恢复。
                            </p>
                            <div className="flex gap-3">
                                <Button 
                                    variant="secondary"
                                    onClick={(e) => handleRestoreConfig(activeConfig.id, e)}
                                    className="text-green-600 bg-green-50 hover:bg-green-100 border-green-200"
                                    isLoading={processingId === activeConfig.id}
                                    disabled={!!processingId}
                                >
                                    恢复配置
                                </Button>
                                <Button 
                                    variant="danger"
                                    onClick={(e) => handleHardDeleteConfig(activeConfig.id, e)}
                                    isLoading={processingId === activeConfig.id}
                                    disabled={!!processingId}
                                >
                                    永久删除
                                </Button>
                            </div>
                        </div>
                    ) : (
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
                                    <div className="bg-white px-3 py-1 rounded border border-gray-200 text-center min-w-[80px]">
                                         <div className="text-xs text-gray-500 mb-1">状态</div>
                                         <button
                                            onClick={(e) => handleTogglePublish(activeConfig.id, e)}
                                            className={`text-sm font-bold flex items-center justify-center gap-1 w-full ${activeConfig.isPublished ? 'text-green-600' : 'text-red-500'}`}
                                        >
                                            {activeConfig.isPublished ? (
                                                <>
                                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                                已上架
                                                </>
                                            ) : (
                                                <>
                                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                已下架
                                                </>
                                            )}
                                        </button>
                                    </div>
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
                    )
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
