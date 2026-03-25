
import React, { useState, useEffect } from 'react';
import { QuizConfig, QuizPartConfig, Difficulty, QuestionType, GradeLevel, QuestionCategory, SUBJECTS, DEFAULT_CONTENT_CATEGORIES } from '../types';
import { saveQuizConfig, deleteQuizConfig, getAvailableQuestionCount, toggleQuizConfigVisibility, restoreQuizConfig, hardDeleteQuizConfig, getSystemSetting, resetQuizAttempts } from '../services/storageService';
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
    { label: '综合', value: GradeLevel.COMPREHENSIVE },
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
const CATEGORIES = Object.values(QuestionCategory).map(c => ({
    label: c,
    value: c
}));

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
    const [contentCategoryOptions, setContentCategoryOptions] = useState<string[]>(DEFAULT_CONTENT_CATEGORIES);

    const [isRefreshing, setIsRefreshing] = useState(false);
    
    // --- Filters ---
    const [searchTerm, setSearchTerm] = useState('');
    const [filterSubject, setFilterSubject] = useState('');
    const [filterGrade, setFilterGrade] = useState('');
    const [filterContentCategory, setFilterContentCategory] = useState('');

    const filteredConfigs = configs.filter(config => {
        // Keyword Search
        if (searchTerm && !config.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }
        // Subject Filter
        if (filterSubject && config.subjects && config.subjects.length > 0 && !config.subjects.includes(filterSubject)) {
            return false;
        }
        // Grade Filter
        if (filterGrade && config.gradeLevels && config.gradeLevels.length > 0 && !config.gradeLevels.includes(filterGrade as GradeLevel)) {
            return false;
        }
        // Content Category Filter
        if (filterContentCategory && config.contentCategories && config.contentCategories.length > 0 && !config.contentCategories.includes(filterContentCategory)) {
            return false;
        }
        return true;
    });

    const resetFilters = () => {
        setSearchTerm('');
        setFilterSubject('');
        setFilterGrade('');
        setFilterContentCategory('');
    };

    useEffect(() => {
        const loadContentCategories = async () => {
            const raw = await getSystemSetting('question_content_categories');
            if (!raw) {
                setContentCategoryOptions(DEFAULT_CONTENT_CATEGORIES);
                return;
            }
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    const values = parsed.filter(v => typeof v === 'string') as string[];
                    setContentCategoryOptions(values.length > 0 ? values : DEFAULT_CONTENT_CATEGORIES);
                    return;
                }
            } catch {
            }
            setContentCategoryOptions(DEFAULT_CONTENT_CATEGORIES);
        };
        loadContentCategories();
    }, []);

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
                checkAvailability(found.parts, found.subjects, found.gradeLevels, found.contentCategories);
            }
        } else {
            setActiveConfig(null);
            setAvailability([]);
        }
    }, [selectedConfigId, configs]);

    // Helper for UUID generation that works in all contexts (including non-secure contexts)
    const generateUUID = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback for environments where crypto.randomUUID is not available (e.g. non-HTTPS)
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    const handleCreateConfig = async () => {
        setIsCreating(true);
        try {
            const newConfig: QuizConfig = {
                // Fix: Use robust UUID generation
                id: generateUUID(),
                name: '新试卷配置',
                description: '这是一份新的试卷配置',
                totalQuestions: 0,
                passingScore: 0,
                createdAt: Date.now(),
                parts: [],
                quizMode: 'practice',
                isPublished: false,
                subjects: [],
                gradeLevels: [],
                contentCategories: [],
                duration: 0 // Default to no time limit
            };
            await saveQuizConfig(newConfig);
            mutateQuizConfigs();
            setSelectedConfigId(newConfig.id);
            addToast('新试卷配置已创建', 'success');
        } catch (error: any) {
            console.error('Failed to create config:', error);
            addToast(`创建失败: ${error.message || '请重试'}`, 'error');
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

    const handleResetAttempts = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('确定要重置此试卷的所有答题状态吗？重置后，所有用户（包括已完成的用户）都可以再次进行答题。')) {
            return;
        }
        setProcessingId(id);
        try {
            await resetQuizAttempts(id);
            // Update local state if active
            if (activeConfig && activeConfig.id === id) {
                setActiveConfig({ ...activeConfig, lastResetAt: Date.now() });
            }
            addToast('答题状态已重置，所有用户可再次答题', 'success');
        } catch (error) {
            console.error('Failed to reset attempts:', error);
            addToast('重置失败', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const checkAvailability = async (parts: QuizPartConfig[], globalSubjects?: string[], globalGradeLevels?: GradeLevel[], globalContentCategories?: string[]) => {
        try {
            // We can run these in parallel
            // Note: getAvailableQuestionCount needs update to support global filters too, 
            // but for now we can pass them merged or update the service.
            // Actually, the service likely takes arrays.
            // Let's assume getAvailableQuestionCount takes (subjects, difficulties, gradeLevels, types, categories, contentCategories)
            
            const promises = parts.map(part => {
                 // Merge global and part filters (part filters are now subset or distinct)
                 // Actually, part.subjects is removed, so we use globalSubjects
                 // part.gradeLevels is removed, so we use globalGradeLevels
                 
                 return getAvailableQuestionCount(
                     globalSubjects || [], 
                     part.difficulties, 
                     globalGradeLevels || [], 
                     part.questionTypes, 
                     part.categories,
                     globalContentCategories || []
                 );
            });
            const counts = await Promise.all(promises);
            setAvailability(counts);
        } catch (error) {
            console.error('Failed to check availability:', error);
        }
    };

    // --- Editor Logic ---

    const updateMeta = (field: 'name' | 'description', value: string) => {
        if (!activeConfig) return;
        const updated = { ...activeConfig, [field]: value };
        setActiveConfig(updated);
    };

    const updateAllowOneAttempt = (allowed: boolean) => {
        if (!activeConfig) return;
        const updated = { ...activeConfig, allowOneAttempt: allowed };
        setActiveConfig(updated);
    };

    const updateQuizMode = (mode: 'practice' | 'exam') => {
        if (!activeConfig) return;
        const updated = { ...activeConfig, quizMode: mode };
        setActiveConfig(updated);
    };

    const updateDuration = (val: number) => {
        if (!activeConfig) return;
        const updated = { ...activeConfig, duration: val >= 0 ? val : 0 };
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
        checkAvailability(newParts, activeConfig.subjects, activeConfig.gradeLevels, activeConfig.contentCategories);
    };

    const updateGlobalFilter = (field: 'subjects' | 'gradeLevels' | 'contentCategories', value: any[]) => {
        if (!activeConfig) return;
        const updatedConfig = { ...activeConfig, [field]: value };
        setActiveConfig(updatedConfig);
        checkAvailability(updatedConfig.parts, updatedConfig.subjects, updatedConfig.gradeLevels, updatedConfig.contentCategories);
    };

    const toggleGlobalArrayItem = (field: 'subjects' | 'gradeLevels' | 'contentCategories', item: any) => {
        if (!activeConfig) return;
        const currentList = (activeConfig[field] as any[]) || [];
        let newList;
        if (currentList.includes(item)) {
            newList = currentList.filter(i => i !== item);
        } else {
            newList = [...currentList, item];
        }
        updateGlobalFilter(field, newList);
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
            // subjects: [], // Removed
            difficulties: [],
            // gradeLevels: [], // Removed
            questionTypes: [],
            categories: [],
            count: 1,
            score: 1
        } as any; // Cast to any to avoid TS error with missing removed fields if types not fully updated in IDE context yet
        const newParts = [...activeConfig.parts, newPart];
        const total = newParts.reduce((sum, part) => sum + Number(part.count), 0);
        const updatedConfig = { ...activeConfig, parts: newParts, totalQuestions: total };
        setActiveConfig(updatedConfig);
        checkAvailability(newParts, activeConfig.subjects, activeConfig.gradeLevels, activeConfig.contentCategories);
    };

    const removePart = (index: number) => {
        if (!activeConfig) return;
        const newParts = activeConfig.parts.filter((_, i) => i !== index);
        const total = newParts.reduce((sum, part) => sum + Number(part.count), 0);
        const updatedConfig = { ...activeConfig, parts: newParts, totalQuestions: total };
        setActiveConfig(updatedConfig);
        checkAvailability(newParts, activeConfig.subjects, activeConfig.gradeLevels, activeConfig.contentCategories);
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

    const renderGlobalToggleGroup = (label: string, options: {label: string, value: any}[], field: 'subjects' | 'gradeLevels' | 'contentCategories') => {
        if (!activeConfig) return null;
        const selectedValues = (activeConfig[field] as any[]) || [];
        const isAllSelected = selectedValues.length === 0;

        return (
            <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label} <span className="text-gray-400 font-normal scale-90 inline-block">(多选，不选默认为全部)</span></label>
                <div className="flex flex-wrap gap-2">
                     <button
                        type="button"
                        onClick={() => updateGlobalFilter(field, [])}
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
                                onClick={() => toggleGlobalArrayItem(field, opt.value)}
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

    const renderGlobalSubjectToggleGroup = () => {
        if (!activeConfig) return null;
        const field = 'subjects';
        const selectedValues = activeConfig.subjects || [];
        const isAllSelected = selectedValues.length === 0;

        return (
             <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">适用学科 <span className="text-gray-400 font-normal scale-90 inline-block">(多选)</span></label>
                <div className="flex flex-wrap gap-2">
                     <button
                        type="button"
                        onClick={() => updateGlobalFilter(field, [])}
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
                                onClick={() => toggleGlobalArrayItem(field, sub)}
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

    const renderSubjectToggleGroup = (partIndex: number) => null; // Deprecated but kept for safety if referenced elsewhere


    // Calculate current max score for reference
    const currentMaxScore = activeConfig ? activeConfig.parts.reduce((sum, part) => sum + (part.count * part.score), 0) : 0;

    return (
        <div className="flex flex-col lg:flex-row gap-6 animate-fade-in min-h-[600px]">
            {/* Sidebar: Exam List & Filters */}
            <div className="w-full lg:w-1/3 xl:w-1/4 flex flex-col gap-4">
                {/* Search & Filters Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                     <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-800 text-lg">
                            {showRecycleBin ? '回收站' : '试卷列表'}
                        </h3>
                        <div className="flex gap-2">
                             <button 
                                onClick={() => setShowRecycleBin(!showRecycleBin)}
                                className={`p-1.5 rounded-lg transition-colors ${showRecycleBin ? 'text-red-600 bg-red-50 hover:bg-red-100' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                                title={showRecycleBin ? "返回列表" : "查看回收站"}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                            <Button variant="ghost" className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-lg" onClick={handleRefresh} disabled={isRefreshing} title="刷新列表">
                                <svg className={`w-5 h-5 ${isConfigsLoading || isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </Button>
                        </div>
                    </div>
                    
                    {!showRecycleBin && (
                        <div className="space-y-3">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input 
                                    type="text"
                                    placeholder="搜索试卷..."
                                    className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm transition duration-150 ease-in-out"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <select 
                                    className="block w-full pl-2 pr-6 py-1.5 text-xs border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 rounded-md bg-gray-50"
                                    value={filterSubject}
                                    onChange={(e) => setFilterSubject(e.target.value)}
                                >
                                    <option value="">所有学科</option>
                                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <select 
                                    className="block w-full pl-2 pr-6 py-1.5 text-xs border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 rounded-md bg-gray-50"
                                    value={filterGrade}
                                    onChange={(e) => setFilterGrade(e.target.value)}
                                >
                                    <option value="">所有学段</option>
                                    {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                                </select>
                            </div>
                            
                            <select 
                                className="block w-full pl-2 pr-6 py-1.5 text-xs border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 rounded-md bg-gray-50"
                                value={filterContentCategory}
                                onChange={(e) => setFilterContentCategory(e.target.value)}
                            >
                                <option value="">所有内容分类</option>
                                {contentCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>

                            {(searchTerm || filterSubject || filterGrade || filterContentCategory) && (
                                <button 
                                    onClick={resetFilters}
                                    className="w-full py-1.5 text-xs text-center text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                                >
                                    重置筛选条件
                                </button>
                            )}
                            
                            <Button 
                                variant="primary" 
                                className="w-full py-2 shadow-sm flex items-center justify-center gap-2" 
                                onClick={handleCreateConfig} 
                                disabled={isCreating}
                            >
                                {isCreating ? (
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                ) : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                )}
                                新建试卷配置
                            </Button>
                        </div>
                    )}
                </div>

                {/* List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden min-h-[400px] max-h-[600px]">
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                        {filteredConfigs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-10">
                                <svg className="w-12 h-12 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p className="text-sm">没有找到相关试卷</p>
                            </div>
                        ) : (
                            filteredConfigs.map(c => (
                                <div 
                                    key={c.id} 
                                    onClick={() => !processingId && setSelectedConfigId(c.id)}
                                    className={`p-4 rounded-xl cursor-pointer border-2 transition-all group relative ${selectedConfigId === c.id ? 'bg-primary-50 border-primary-200 shadow-md transform scale-[1.02]' : 'bg-white border-transparent hover:border-gray-200 hover:shadow-sm'} ${processingId === c.id ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className={`font-bold text-sm line-clamp-2 leading-snug ${selectedConfigId === c.id ? 'text-primary-900' : 'text-gray-800'}`}>
                                            {c.name}
                                        </h4>
                                        {!c.isPublished && <span className="flex-shrink-0 ml-2 text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">已下架</span>}
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-1 mb-3">
                                        {c.subjects && c.subjects.length > 0 && (
                                            <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-50 text-indigo-600">
                                                {c.subjects.join(', ')}
                                            </span>
                                        )}
                                        {c.gradeLevels && c.gradeLevels.length > 0 && (
                                            <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-50 text-purple-600">
                                                {c.gradeLevels.map(g => g === GradeLevel.PRIMARY ? '小学' : g === GradeLevel.JUNIOR ? '初中' : g === GradeLevel.SENIOR ? '高中' : '综合').join(', ')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-end pt-2 border-t border-gray-100 mt-2">
                                        <div className="text-xs text-gray-500 flex flex-col">
                                            <span className="font-semibold text-gray-700">{c.totalQuestions} 道题</span>
                                            <span className="text-[10px] text-gray-400 mt-0.5">{new Date(c.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {processingId === c.id ? (
                                                <svg className="w-4 h-4 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            ) : (
                                                <>
                                                    {showRecycleBin ? (
                                                        <>
                                                            <button 
                                                                onClick={(e) => handleRestoreConfig(c.id, e)}
                                                                className="text-green-600 hover:text-green-800 p-1.5 rounded-full hover:bg-green-50 transition-colors"
                                                                title="恢复"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                            </button>
                                                            <button 
                                                                onClick={(e) => handleHardDeleteConfig(c.id, e)}
                                                                className="text-red-500 hover:text-red-700 p-1.5 rounded-full hover:bg-red-50 transition-colors"
                                                                title="永久删除"
                                                            >
                                                                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={(e) => handleTogglePublish(c.id, e)}
                                                                className={`p-1.5 rounded-full hover:bg-gray-100 transition-colors ${c.isPublished ? 'text-green-500 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'}`}
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
                                                                className="text-gray-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 transition-colors"
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
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Main Panel: Editor */}
            <div className="w-full lg:w-2/3 xl:w-3/4 bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col overflow-hidden min-h-[600px] lg:max-h-[800px]">
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
                        <div className="p-6 border-b border-gray-100 flex flex-col bg-gray-50/50">
                            <div className="flex flex-col lg:flex-row justify-between items-start gap-6 mb-6">
                                <div className="flex-1 w-full">
                                    <input 
                                        type="text" 
                                        className="text-2xl font-bold text-gray-800 bg-transparent border-none focus:ring-0 w-full p-0 placeholder-gray-300 focus:placeholder-gray-200"
                                        value={activeConfig.name}
                                        onChange={(e) => updateMeta('name', e.target.value)}
                                        placeholder="请输入试卷名称"
                                    />
                                    <input 
                                        type="text" 
                                        className="mt-2 text-sm text-gray-500 bg-transparent border-none focus:ring-0 w-full p-0 placeholder-gray-300 focus:placeholder-gray-200"
                                        value={activeConfig.description || ''}
                                        onChange={(e) => updateMeta('description', e.target.value)}
                                        placeholder="添加试卷描述..."
                                    />
                                </div>
                                <div className="flex flex-col items-end gap-3 flex-shrink-0 w-full lg:w-auto">
                                    <div className="flex flex-wrap items-center gap-2 justify-end">
                                        <div className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-center min-w-[80px] shadow-sm">
                                             <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">状态</div>
                                             <button
                                                onClick={(e) => handleTogglePublish(activeConfig.id, e)}
                                                className={`text-sm font-bold flex items-center justify-center gap-1.5 w-full ${activeConfig.isPublished ? 'text-green-600' : 'text-red-500'}`}
                                            >
                                                <span className={`w-2 h-2 rounded-full ${activeConfig.isPublished ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                {activeConfig.isPublished ? '已上架' : '已下架'}
                                            </button>
                                        </div>
                                        <div className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-center min-w-[80px] shadow-sm">
                                             <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">次数限制</div>
                                             <div className="flex gap-1 items-center justify-center">
                                                 <button
                                                     onClick={() => updateAllowOneAttempt(!activeConfig.allowOneAttempt)}
                                                     className={`text-sm font-bold flex items-center justify-center gap-1.5 flex-1 ${activeConfig.allowOneAttempt ? 'text-orange-600' : 'text-gray-500'}`}
                                                     title={activeConfig.allowOneAttempt ? "仅允许一次答题" : "不限制答题次数"}
                                                 >
                                                     {activeConfig.allowOneAttempt ? '仅一次' : '不限制'}
                                                 </button>
                                                 {activeConfig.allowOneAttempt && (
                                                     <button
                                                         onClick={(e) => handleResetAttempts(activeConfig.id, e)}
                                                         className="text-gray-400 hover:text-primary-600 p-0.5 rounded transition-colors"
                                                         title="重置所有用户答题状态（允许重新答题）"
                                                     >
                                                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                         </svg>
                                                     </button>
                                                 )}
                                             </div>
                                         </div>
                                        <div className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-center shadow-sm">
                                            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">模式</div>
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
                                        <div className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-center shadow-sm">
                                            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">及格分</div>
                                            <input 
                                                type="number" 
                                                min="0"
                                                className="w-16 font-bold text-primary-600 text-center border-none p-0 focus:ring-0 text-sm" 
                                                value={activeConfig.passingScore}
                                                onChange={(e) => updatePassingScore(parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-center shadow-sm">
                                            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">时长(分)</div>
                                            <input 
                                                type="number" 
                                                min="0"
                                                className="w-16 font-bold text-gray-700 text-center border-none p-0 focus:ring-0 text-sm" 
                                                value={activeConfig.duration || 0}
                                                onChange={(e) => updateDuration(parseInt(e.target.value) || 0)}
                                                title="0表示不限制时长"
                                            />
                                        </div>
                                        <div className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-center shadow-sm">
                                            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">总分</div>
                                            <div className="font-bold text-gray-700 text-sm px-2">{currentMaxScore}</div>
                                        </div>
                                    </div>
                                    <Button onClick={handleSave} className="shadow-sm py-2 text-sm w-full lg:w-auto" isLoading={isSaving}>保存配置</Button>
                                </div>
                            </div>

                            {/* Global Filters Section */}
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <h4 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2 pb-2 border-b border-gray-100">
                                    <span className="p-1 bg-primary-50 rounded text-primary-600">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                                    </span>
                                    整卷筛选规则
                                    <span className="text-xs font-normal text-gray-400 ml-2">设置适用于整张试卷的题目范围</span>
                                </h4>
                                <div className="space-y-4">
                                    {renderGlobalSubjectToggleGroup()}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                         {renderGlobalToggleGroup('适用学段', GRADES, 'gradeLevels')}
                                         {renderGlobalToggleGroup('题目内容分类', contentCategoryOptions.map(c => ({ label: c, value: c })), 'contentCategories')}
                                     </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                             {activeConfig.parts.length === 0 && (
                                 <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-white">
                                     <div className="p-4 bg-gray-50 rounded-full mb-3">
                                         <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                     </div>
                                     <p className="font-medium">暂无试题部分</p>
                                     <p className="text-sm mt-1">点击下方按钮添加第一部分试题</p>
                                 </div>
                             )}
                             
                             <div className="space-y-6">
                                {activeConfig.parts.map((part, index) => (
                                    <div key={part.id} className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
                                        <div className="flex justify-between items-center px-5 py-3 border-b border-gray-100 bg-gray-50/30">
                                            <div className="flex items-center gap-3 flex-1">
                                                <span className="bg-gray-800 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider">PART {index + 1}</span>
                                                <input 
                                                    type="text"
                                                    className="bg-transparent border-none hover:bg-white focus:bg-white focus:ring-2 focus:ring-primary-500 rounded px-2 py-1 text-sm font-bold text-gray-700 transition-all w-48"
                                                    value={part.name}
                                                    onChange={(e) => updatePart(index, 'name', e.target.value)}
                                                    placeholder="部分名称"
                                                />
                                            </div>
                                            <button onClick={() => removePart(index)} className="text-gray-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 transition-colors">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>

                                        <div className="p-5">
                                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                                <div className="lg:col-span-8 space-y-5">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                                        {renderToggleGroup('难度限制', DIFFICULTIES, index, 'difficulties')}
                                                        {renderToggleGroup('功能分类', CATEGORIES, index, 'categories')}
                                                    </div>
                                                    {renderToggleGroup('题型限制', TYPES, index, 'questionTypes')}
                                                </div>
                                                <div className="lg:col-span-4 flex flex-col gap-4 lg:border-l lg:border-gray-100 lg:pl-8">
                                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                        <div className="mb-4">
                                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">单题分值</label>
                                                            <div className="flex items-center relative">
                                                                <input type="number" min="0.5" step="0.5" className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-primary-500 focus:border-primary-500" value={part.score} onChange={(e) => updatePart(index, 'score', parseFloat(e.target.value) || 0)} />
                                                                <span className="absolute right-3 text-xs text-gray-500 font-bold">分</span>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">抽取数量</label>
                                                            <div className="flex items-center relative">
                                                                <input type="number" min="1" max="50" className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-800 focus:ring-primary-500 focus:border-primary-500" value={part.count} onChange={(e) => updatePart(index, 'count', parseInt(e.target.value) || 1)} />
                                                                <span className="absolute right-3 text-xs text-gray-500 font-bold">道</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className={`flex-1 flex flex-col justify-center items-center rounded-xl border-2 border-dashed p-4 transition-colors ${availability[index] < part.count ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                                                        <div className={`text-center ${availability[index] < part.count ? 'text-red-600' : 'text-green-600'}`}>
                                                            <span className="block text-xs font-bold opacity-60 uppercase tracking-wider mb-1">当前匹配库存</span>
                                                            <span className="text-3xl font-extrabold tracking-tight">{availability[index]}</span>
                                                        </div>
                                                        {availability[index] < part.count ? (
                                                            <div className="mt-2 text-xs text-red-600 font-bold bg-red-100 px-2 py-1 rounded">库存不足</div>
                                                        ) : (
                                                            <div className="mt-2 text-xs text-green-600 font-bold bg-green-100 px-2 py-1 rounded">库存充足</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <Button variant="secondary" onClick={addPart} className="w-full border-dashed py-4 text-gray-500 hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 transition-all">
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
