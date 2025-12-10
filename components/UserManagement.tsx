import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { getPaginatedUsers, adminAddUser, deleteUser, updateUserRole } from '../services/storageService';
import { Button } from './Button';
import { useToast } from './Toast';

// Define the types of actions that require confirmation
type ActionType = 'DELETE' | 'CHANGE_ROLE';

interface PendingAction {
  type: ActionType;
  user: User;
  newRole?: UserRole; // Only for CHANGE_ROLE
}

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // New User Form State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.USER);
  const [isAdding, setIsAdding] = useState(false);

  // Modal State for Confirmation
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  useEffect(() => {
    loadUsers();
  }, [currentPage]);

  const loadUsers = async () => {
    setLoading(true);
    const { data, total } = await getPaginatedUsers(currentPage, itemsPerPage);
    setUsers(data);
    setTotalUsers(total);
    setLoading(false);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;

    const result = await adminAddUser(newUsername, newPassword, newRole);
    if (result.success) {
      setNewUsername('');
      setNewPassword('');
      setNewRole(UserRole.USER);
      setIsAdding(false);
      await loadUsers();
      addToast('用户添加成功', 'success');
    } else {
      addToast(result.message, 'error');
    }
  };


  // Triggered when "Delete" button is clicked
  const initiateDelete = (user: User) => {
    setPendingAction({
      type: 'DELETE',
      user
    });
  };

  // Triggered when Select dropdown changes
  const initiateRoleChange = (user: User, newRole: UserRole) => {
    if (user.role === newRole) return;
    setPendingAction({
      type: 'CHANGE_ROLE',
      user,
      newRole
    });
  };

  // Execute the pending action
  const confirmAction = async () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'DELETE') {
      const { success, error } = await deleteUser(pendingAction.user.id);
      if (success) {
          addToast(`用户 ${pendingAction.user.username} 已被删除`, 'success');
          await loadUsers();
      } else {
          addToast(`删除用户失败: ${error?.message || '未知错误'}`, 'error');
      }
    } else if (pendingAction.type === 'CHANGE_ROLE' && pendingAction.newRole) {
      const { success, error } = await updateUserRole(pendingAction.user.id, pendingAction.newRole);
      if (success) {
          addToast(`用户 ${pendingAction.user.username} 权限已更新`, 'success');
          await loadUsers();
      } else {
          addToast(`权限更新失败: ${error?.message || '未知错误'}`, 'error');
      }
    }
    
    setPendingAction(null);
  };

  // Cancel the pending action
  const cancelAction = () => {
    setPendingAction(null);
    // Reload to reset dropdown UI if needed
    loadUsers();
  };

  const getRoleLabel = (role: UserRole) => {
    if (role === UserRole.SUPER_ADMIN) return '超级管理员';
    if (role === UserRole.ADMIN) return '普通管理员';
    return '普通用户';
  };

  if (loading) return <div className="p-10 text-center">加载用户列表...</div>;

  return (
    <div className="space-y-6 animate-fade-in relative">
      
      {/* Add User Section */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <div className="flex justify-between items-center mb-4">
           <h3 className="text-lg font-bold text-gray-800">用户列表管理</h3>
           <Button variant={isAdding ? 'secondary' : 'primary'} onClick={() => setIsAdding(!isAdding)} className="text-sm">
              {isAdding ? '取消添加' : '添加新用户'}
           </Button>
        </div>

        {isAdding && (
          <form onSubmit={handleAddUser} className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6 animate-fade-in">
            <h4 className="text-sm font-bold text-gray-700 mb-3">添加新用户</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
               <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">用户名</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-3 py-2 border rounded text-sm"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                  />
               </div>
               <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">初始密码</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-3 py-2 border rounded text-sm"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
               </div>
               <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">权限角色</label>
                  <select 
                    className="w-full px-3 py-2 border rounded text-sm bg-white"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                  >
                    <option value={UserRole.USER}>普通用户</option>
                    <option value={UserRole.ADMIN}>普通管理员</option>
                  </select>
               </div>
               <Button type="submit" className="h-[38px]">确认添加</Button>
            </div>
          </form>
        )}

        <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">角色权限</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">注册时间</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                      暂无其他用户
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {u.username}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                         {/* Controlled component: value is tied to state. Change triggers Modal, not immediate update */}
                         <select
                            value={u.role}
                            onChange={(e) => initiateRoleChange(u, e.target.value as UserRole)}
                            className={`
                                block w-full pl-3 pr-8 py-1.5 text-xs font-semibold border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md cursor-pointer transition-colors
                                ${u.role === UserRole.SUPER_ADMIN ? 'bg-purple-50 text-purple-800 border-purple-200' : u.role === UserRole.ADMIN ? 'bg-indigo-50 text-indigo-800 border-indigo-200' : 'bg-white text-gray-700 border-gray-200'}
                            `}
                         >
                             <option value={UserRole.USER}>普通用户</option>
                             <option value={UserRole.ADMIN}>普通管理员</option>
                             <option value={UserRole.SUPER_ADMIN}>超级管理员</option>
                         </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                        <button 
                           onClick={() => initiateDelete(u)}
                           className="text-red-600 hover:text-red-900 transition-colors"
                        >
                           删除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
        </div>

        {/* Pagination Controls */}
        {totalUsers > itemsPerPage && (
            <div className="flex justify-center items-center mt-4 gap-2">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                >
                    上一页
                </Button>
                <span className="text-sm text-gray-600">
                    第 {currentPage} 页 / 共 {Math.ceil(totalUsers / itemsPerPage)} 页
                </span>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    disabled={currentPage === Math.ceil(totalUsers / itemsPerPage)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalUsers / itemsPerPage), prev + 1))}
                >
                    下一页
                </Button>
            </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 transform transition-all scale-100">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {pendingAction.type === 'DELETE' ? '删除用户确认' : '修改权限确认'}
                </h3>
                
                <div className="text-gray-600 mb-6">
                    {pendingAction.type === 'DELETE' ? (
                        <p>
                            您确定要删除用户 <span className="font-bold text-gray-800">{pendingAction.user.username}</span> 吗？
                            <br/><span className="text-sm text-red-500">此操作无法撤销。</span>
                        </p>
                    ) : (
                        <p>
                            您确定要将用户 <span className="font-bold text-gray-800">{pendingAction.user.username}</span> 的权限修改为
                            <span className="font-bold text-primary-600 mx-1">
                                {pendingAction.newRole && getRoleLabel(pendingAction.newRole)}
                            </span>
                            吗？
                        </p>
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={cancelAction}>
                        取消
                    </Button>
                    <Button 
                        variant={pendingAction.type === 'DELETE' ? 'danger' : 'primary'} 
                        onClick={confirmAction}
                    >
                        确认{pendingAction.type === 'DELETE' ? '删除' : '修改'}
                    </Button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};