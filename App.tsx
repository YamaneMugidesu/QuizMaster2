import React, { useState, useEffect, Suspense, lazy } from 'react';
import { User, UserRole, QuizResult } from './types';
import { Button } from './components/Button';
import { loginUser, registerUser, saveQuizResult, checkUserStatus, getSystemSetting } from './services/storageService';
import { supabase } from './services/supabaseClient';
import { ToastProvider, useToast } from './components/Toast';

const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const QuizTaker = lazy(() => import('./components/QuizTaker').then(module => ({ default: module.QuizTaker })));
const QuizResultView = lazy(() => import('./components/QuizResult').then(module => ({ default: module.QuizResultView })));
const UserDashboard = lazy(() => import('./components/UserDashboard').then(module => ({ default: module.UserDashboard })));

const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
  </div>
);

// Wrap the main content to use the useToast hook
const MainContent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'dashboard' | 'quiz' | 'result'>('dashboard');
  const [currentResult, setCurrentResult] = useState<QuizResult | null>(null);
  const [activeConfigId, setActiveConfigId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRegistrationAllowed, setIsRegistrationAllowed] = useState(true);
  const { addToast } = useToast();

  // Periodically check user status
  useEffect(() => {
    if (!user) return;

    const checkStatus = async () => {
      const isActive = await checkUserStatus(user.id);
      if (!isActive) {
        addToast('您的账号已被禁用或删除，即将退出登录', 'error');
        handleLogout();
      }
    };

    const intervalId = setInterval(checkStatus, 30000); // Check every 30 seconds

    return () => clearInterval(intervalId);
  }, [user]);

  // Restore Session
  useEffect(() => {
    const restoreSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
          const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
          if (profile) {
              setUser({
                  id: profile.id,
                  username: profile.username,
                  role: profile.role as UserRole,
                  createdAt: new Date(profile.created_at).getTime()
              });
          } else if (profileError) {
              // Fallback to metadata on error
              console.warn('Profile restore failed, using metadata fallback', profileError);
              const metadata = session.user.user_metadata;
              if (metadata && metadata.username) {
                   setUser({
                      id: session.user.id,
                      username: metadata.username,
                      role: (metadata.role as UserRole) || UserRole.USER,
                      createdAt: new Date(session.user.created_at).getTime()
                  });
              }
          }
      }
    };
    restoreSession();
    
    // Check registration setting
    const checkSettings = async () => {
        const val = await getSystemSetting('allow_registration');
        setIsRegistrationAllowed(val !== 'false');
    };
    checkSettings();
  }, []);

  // Auth Form State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsProcessing(true);

    try {
        if (authMode === 'login') {
            const result = await loginUser(username, password);
            if (result.success && result.user) {
               setUser(result.user);
               setView('dashboard');
            } else {
               setAuthError(result.message || '登录失败');
            }
        } else {
             if (password !== confirmPassword) {
                setAuthError('两次输入的密码不一致');
                setIsProcessing(false);
                return;
             }
             if (!username || !password) {
                setAuthError('用户名和密码不能为空');
                setIsProcessing(false);
                return;
             }
             const result = await registerUser(username, password);
             if (result.success) {
                addToast("注册成功！请登录。", 'success');
                setAuthMode('login');
                setPassword('');
                setConfirmPassword('');
             } else {
                setAuthError(result.message || '注册失败');
             }
        }
    } catch (e) {
        setAuthError('系统错误，请重试');
    } finally {
        setIsProcessing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setUser(null);
      setView('dashboard');
      setCurrentResult(null);
      setUsername('');
      setPassword('');
      setAuthError('');
      setActiveConfigId('');
    }
  };

  const handleStartQuiz = (configId: string) => {
      setActiveConfigId(configId);
      setView('quiz');
  };

  const handleQuizComplete = async (partialResult: QuizResult) => {
    if (!user) return;
    
    // Enrich result with user metadata
    const fullResult: QuizResult = {
        ...partialResult,
        id: Math.random().toString(36).substr(2, 9),
        userId: user.id,
        username: user.username,
        timestamp: Date.now()
    };
    
    try {
        await saveQuizResult(fullResult);
        setCurrentResult(fullResult);
        setView('result');
    } catch (error: any) {
        console.error('Failed to save result:', error);
        if (error.message?.includes('deactivated or deleted')) {
            addToast('您的账号已被禁用或删除，无法保存记录', 'error');
            handleLogout();
        } else {
            addToast('保存成绩失败，请重试', 'error');
            // Still show result? Maybe not if it failed to save.
            // But for user experience, maybe show it but warn?
            // Let's just return to dashboard or show error.
        }
    }
  };

  const handleViewHistoryResult = (result: QuizResult) => {
      setCurrentResult(result);
      setView('result');
  };

  const handleBackFromDetails = () => {
      setCurrentResult(null);
      setView('dashboard');
  };

  // Login/Register Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg transform -rotate-6">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">准入考核平台</h1>
          <p className="text-gray-500 mb-8">{authMode === 'login' ? '请登录您的账户' : '创建一个新账户'}</p>
          
          <form onSubmit={handleAuthSubmit} className="space-y-4 text-left">
             {authError && (
                 <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                     {authError}
                 </div>
             )}
             <div key="username-field">
                 <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                 <input 
                    type="text" 
                    required
                    autoComplete="username"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="请输入用户名"
                 />
             </div>
             <div key="password-field">
                 <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
                 <input 
                    type="password" 
                    required
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="请输入密码"
                 />
             </div>
             
             <div key="confirm-field-container">
                 {authMode === 'register' && (
                    <div className="animate-fade-in">
                        <label className="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
                        <input 
                            type="password" 
                            required
                            autoComplete="new-password"
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="请再次输入密码"
                        />
                    </div>
                 )}
             </div>

             <Button type="submit" className="w-full justify-center mt-4" isLoading={isProcessing}>
                 {authMode === 'login' ? '登录' : '注册'}
             </Button>
          </form>

          <div className="mt-6 text-sm text-gray-500">
             {authMode === 'login' ? (
                 <>
                    {isRegistrationAllowed ? (
                        <>还没有账号？ <button onClick={() => { setAuthMode('register'); setAuthError(''); }} className="text-primary-600 font-bold hover:underline">立即注册</button></>
                    ) : (
                        <span className="text-gray-400">目前暂不开放注册，请联系管理员</span>
                    )}
                 </>
             ) : (
                 <>已有账号？ <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-primary-600 font-bold hover:underline">去登录</button></>
             )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center cursor-pointer" onClick={() => setView('dashboard')}>
               <div className="bg-primary-600 text-white p-1.5 rounded-lg mr-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
               </div>
               <span className="font-bold text-xl text-gray-800">准入考核平台</span>
            </div>
            <div className="flex items-center gap-4">
               <div className="hidden sm:flex flex-col items-end mr-2">
                  <span className="text-sm font-bold text-gray-800">{user.username}</span>
                  <span className="text-xs text-gray-500">
                      {user.role === UserRole.SUPER_ADMIN ? '超级管理员' : 
                       user.role === UserRole.ADMIN ? '普通管理员' : '普通用户'}
                  </span>
               </div>
               <Button variant="ghost" onClick={handleLogout} className="text-sm border border-gray-200">退出</Button>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <Suspense fallback={<LoadingSpinner />}>
        {/* Global Result View */}
        {view === 'result' && currentResult && (
             <QuizResultView 
                result={currentResult} 
                onRetry={user.role === UserRole.USER ? () => setView('quiz') : undefined} 
                onExit={handleBackFromDetails} 
                isAdmin={user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN}
             />
        )}

        {/* Dashboard Views */}
        {view !== 'result' && (
            <>
                {(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) && (
                    <AdminDashboard onViewResult={handleViewHistoryResult} currentUser={user} />
                )}

                {user.role === UserRole.USER && (
                <>
                    {view === 'dashboard' && (
                        <UserDashboard 
                            user={user} 
                            onStartQuiz={handleStartQuiz} 
                            onViewResult={handleViewHistoryResult}
                        />
                    )}
                    
                    {view === 'quiz' && (
                        <QuizTaker 
                            configId={activeConfigId} 
                            onComplete={handleQuizComplete} 
                            onExit={() => setView('dashboard')} 
                        />
                    )}
                </>
                )}
            </>
        )}
        </Suspense>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ToastProvider>
      <MainContent />
    </ToastProvider>
  );
};

export default App;