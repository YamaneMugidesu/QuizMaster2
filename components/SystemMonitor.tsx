import React, { useEffect, useState } from 'react';
import { logger, SystemLog, LogLevel, LogCategory } from '../services/loggerService';
import { useToast } from './Toast';

// --- Icons ---
const InfoIcon = ({ className, size = 16 }: { className?: string, size?: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
);
const AlertTriangleIcon = ({ className, size = 16 }: { className?: string, size?: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
);
const AlertCircleIcon = ({ className, size = 16 }: { className?: string, size?: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
);
const SearchIcon = ({ className, size = 18 }: { className?: string, size?: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
);
const RefreshCwIcon = ({ className, size = 18 }: { className?: string, size?: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
);
const XIcon = ({ className, size = 24 }: { className?: string, size?: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);
const TrashIcon = ({ className, size = 18 }: { className?: string, size?: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
);

const LOG_LEVEL_COLORS = {
    'INFO': 'text-blue-500 bg-blue-50 border-blue-200',
    'WARNING': 'text-yellow-600 bg-yellow-50 border-yellow-200',
    'ERROR': 'text-red-600 bg-red-50 border-red-200',
    'CRITICAL': 'text-purple-700 bg-purple-50 border-purple-200'
};

const LOG_LEVEL_ICONS = {
    'INFO': <InfoIcon size={16} />,
    'WARNING': <AlertTriangleIcon size={16} />,
    'ERROR': <AlertCircleIcon size={16} />,
    'CRITICAL': <AlertCircleIcon size={16} />
};

export default function SystemMonitor() {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    
    // Filters
    const [levelFilter, setLevelFilter] = useState<LogLevel | ''>('');
    const [categoryFilter, setCategoryFilter] = useState<LogCategory | ''>('');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const { addToast } = useToast();
    
    // Auto Refresh
    const [autoRefresh, setAutoRefresh] = useState(false);

    // Detail Modal
    const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1); // Reset to first page on search
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Auto Refresh Effect
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            fetchLogs();
        }, 10000); // 10 seconds
        return () => clearInterval(interval);
    }, [autoRefresh, page, limit, levelFilter, categoryFilter, debouncedSearch]);

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        setSelectedIds(new Set()); // Clear selection on fetch
        try {
            const result = await logger.getSystemLogs(page, limit, {
                level: levelFilter as LogLevel || undefined,
                category: categoryFilter as LogCategory || undefined,
                search: debouncedSearch
            });
            setLogs(result.data);
            setTotal(result.total);
        } catch (error: any) {
            console.error('Failed to load logs', error);
            setError('获取日志失败，请稍后重试');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [page, limit, levelFilter, categoryFilter, debouncedSearch]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(logs.map(log => log.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectOne = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedIds);
        if (checked) {
            newSelected.add(id);
        } else {
            newSelected.delete(id);
        }
        setSelectedIds(newSelected);
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return;
        
        if (!confirm(`确定要删除选中的 ${selectedIds.size} 条日志吗？此操作不可恢复。`)) {
            return;
        }

        setIsDeleting(true);
        try {
            await logger.deleteLogs(Array.from(selectedIds));
            addToast(`成功删除 ${selectedIds.size} 条日志`, 'success');
            // Reload logs
            fetchLogs();
        } catch (error) {
            console.error('Failed to delete logs', error);
            addToast('删除日志失败', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const LogDetailModal = ({ log, onClose }: { log: SystemLog; onClose: () => void }) => {
        if (!log) return null;
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                    <div className="flex justify-between items-center p-6 border-b">
                        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <span className={`p-1 rounded ${LOG_LEVEL_COLORS[log.level]}`}>
                                {LOG_LEVEL_ICONS[log.level]}
                            </span>
                            系统日志详情
                        </h3>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            <XIcon size={24} />
                        </button>
                    </div>
                    <div className="p-6 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-500">时间</label>
                                <div className="mt-1 text-gray-900">{formatTime(log.createdAt)}</div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500">级别</label>
                                <div className="mt-1 font-mono">{log.level}</div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500">分类</label>
                                <div className="mt-1 font-mono">{log.category}</div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500">触发用户</label>
                                <div className="mt-1">{log.username || 'System'} <span className="text-gray-400 text-xs">({log.userId || 'N/A'})</span></div>
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-500 mb-2">消息内容</label>
                            <div className="bg-gray-50 p-3 rounded border text-gray-800">
                                {log.message}
                            </div>
                        </div>

                        {log.details && (
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2">JSON 详情数据</label>
                                <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                                    {JSON.stringify(log.details, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                    <div className="p-4 border-t bg-gray-50 flex justify-end">
                        <button 
                            onClick={onClose}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <AlertCircleIcon className="text-indigo-600" />
                系统日志监控
            </h2>
            {/* Header / Controls */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex gap-4 items-center flex-1">
                    <div className="relative flex-1 max-w-md">
                        <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="搜索日志消息..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    
                    <select 
                        value={levelFilter} 
                        onChange={(e) => {
                            setLevelFilter(e.target.value as LogLevel);
                            setPage(1);
                        }}
                        className="border border-gray-300 rounded-md py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option value="">所有级别</option>
                        <option value="INFO">INFO</option>
                        <option value="WARNING">WARNING</option>
                        <option value="ERROR">ERROR</option>
                        <option value="CRITICAL">CRITICAL</option>
                    </select>

                    <select 
                        value={categoryFilter} 
                        onChange={(e) => {
                            setCategoryFilter(e.target.value as LogCategory);
                            setPage(1);
                        }}
                        className="border border-gray-300 rounded-md py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option value="">所有分类</option>
                        <option value="AUTH">AUTH (认证)</option>
                        <option value="SYSTEM">SYSTEM (系统)</option>
                        <option value="DB">DB (数据库)</option>
                        <option value="USER_ACTION">USER (用户行为)</option>
                        <option value="AI">AI (智能)</option>
                    </select>
                </div>

                {selectedIds.size > 0 && (
                    <button 
                        onClick={handleDeleteSelected} 
                        disabled={isDeleting}
                        className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors border border-red-200"
                    >
                        <TrashIcon size={18} />
                        删除 ({selectedIds.size})
                    </button>
                )}

                <div className="flex items-center gap-4">
                     <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                        <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                            <input 
                                type="checkbox" 
                                name="toggle" 
                                id="toggle" 
                                className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                checked={autoRefresh}
                                onChange={() => setAutoRefresh(!autoRefresh)}
                                style={{ 
                                    right: autoRefresh ? '0' : 'auto', 
                                    left: autoRefresh ? 'auto' : '0',
                                    borderColor: autoRefresh ? '#4f46e5' : '#d1d5db'
                                }}
                            />
                            <label 
                                htmlFor="toggle" 
                                className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${autoRefresh ? 'bg-indigo-600' : 'bg-gray-300'}`}
                            ></label>
                        </div>
                        自动刷新
                    </label>
                    <button 
                        onClick={fetchLogs} 
                        className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                        title="刷新"
                    >
                        <RefreshCwIcon className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 w-12">
                                <input 
                                    type="checkbox" 
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                    onChange={handleSelectAll}
                                    checked={logs.length > 0 && selectedIds.size === logs.length}
                                />
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                                级别
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                                时间
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                                分类
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                消息
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                                用户
                            </th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                                操作
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                                    <div className="flex justify-center items-center gap-2">
                                        <RefreshCwIcon className="animate-spin" size={20} />
                                        加载中...
                                    </div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-10 text-center text-red-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <AlertCircleIcon size={24} />
                                        <span>{error}</span>
                                        <button 
                                            onClick={fetchLogs}
                                            className="mt-2 text-indigo-600 hover:text-indigo-800 underline text-sm"
                                        >
                                            重试
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                                    暂无日志记录
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedLog(log)}>
                                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                        <input 
                                            type="checkbox" 
                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                            checked={selectedIds.has(log.id)}
                                            onChange={(e) => handleSelectOne(log.id, e.target.checked)}
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${LOG_LEVEL_COLORS[log.level]}`}>
                                            {LOG_LEVEL_ICONS[log.level]}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                                        {formatTime(log.createdAt).split(' ')[1]} 
                                        <span className="text-xs text-gray-400 ml-1">{formatTime(log.createdAt).split(' ')[0]}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {log.category}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        <div className="truncate max-w-lg" title={log.message}>
                                            {log.message}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {log.username || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
                                            className="text-indigo-600 hover:text-indigo-900"
                                        >
                                            详情
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                
                {/* Pagination */}
                <div className="bg-white px-4 py-3 border-t border-gray-200 flex items-center justify-between sm:px-6">
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                            <p className="text-sm text-gray-700">
                                显示 <span className="font-medium">{(page - 1) * limit + 1}</span> 到 <span className="font-medium">{Math.min(page * limit, total)}</span> 条，共 <span className="font-medium">{total}</span> 条
                            </p>
                            <select
                                value={limit}
                                onChange={(e) => {
                                    setLimit(Number(e.target.value));
                                    setPage(1);
                                }}
                                className="text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value={10}>10 条/页</option>
                                <option value={20}>20 条/页</option>
                                <option value={50}>50 条/页</option>
                                <option value={100}>100 条/页</option>
                            </select>
                        </div>
                        <div>
                            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                <button
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    disabled={page === 1}
                                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                                >
                                    上一页
                                </button>
                                {/* Simple Page Indicator */}
                                <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                    第 {page} 页 / 共 {Math.ceil(total / limit) || 1} 页
                                </span>
                                <button
                                    onClick={() => setPage(page + 1)}
                                    disabled={page * limit >= total}
                                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                                >
                                    下一页
                                </button>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>

            {selectedLog && (
                <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
            )}
        </div>
    );
}
