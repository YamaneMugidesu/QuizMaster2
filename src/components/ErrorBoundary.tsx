import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    
    // Auto-reload on chunk load error (Version update mismatch)
    if (error.message && (
        error.message.includes('Failed to fetch dynamically imported module') || 
        error.message.includes('Importing a module script failed')
    )) {
        const storageKey = 'chunk_load_error_reload';
        const lastReload = sessionStorage.getItem(storageKey);
        const now = Date.now();
        
        // If never reloaded or reloaded more than 10 seconds ago (prevent infinite loop)
        if (!lastReload || now - parseInt(lastReload) > 10000) {
            console.log('Chunk load error detected, reloading...');
            sessionStorage.setItem(storageKey, now.toString());
            window.location.reload();
            return;
        }
    }

    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      const isChunkError = this.state.error?.message?.includes('Failed to fetch dynamically imported module') || 
                           this.state.error?.message?.includes('Importing a module script failed');

      return (
        <div className="p-8 max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h1 className="text-2xl font-bold text-red-800 mb-4">
                {isChunkError ? '发现新版本 (New Version Available)' : '出错了 (Something went wrong)'}
            </h1>
            
            {isChunkError ? (
                <div className="text-amber-800 bg-amber-50 p-4 rounded border border-amber-200 mb-4">
                    <p className="font-bold mb-2">系统已更新</p>
                    <p>您的浏览器正在使用旧版本的缓存文件。我们尝试了自动刷新但失败了。</p>
                    <p className="mt-2">请尝试：</p>
                    <ul className="list-disc pl-5 mt-1">
                        <li>点击下方的“刷新页面”按钮</li>
                        <li>如果仍然报错，请使用 <strong>Ctrl + F5</strong> (Windows) 或 <strong>Cmd + Shift + R</strong> (Mac) 强制刷新</li>
                    </ul>
                </div>
            ) : (
                <p className="text-red-700 mb-4">应用程序遇到错误，无法渲染。</p>
            )}

            <details className="whitespace-pre-wrap bg-white p-4 rounded border border-red-100 text-sm text-red-600 font-mono overflow-auto max-h-64">
              <summary className="cursor-pointer mb-2 text-red-500 hover:text-red-700">查看错误详情</summary>
              {this.state.error && this.state.error.toString()}
              <br />
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </details>
            
            <button 
                onClick={() => {
                    // Clear cache marker before manual reload
                    sessionStorage.removeItem('chunk_load_error_reload');
                    window.location.reload();
                }}
                className="mt-6 px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium transition-colors shadow-sm"
            >
                刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
