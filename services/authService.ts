import { supabase } from './supabaseClient';
import { User, UserRole } from '../types';

// Helper to generate safe email from username (handles Chinese characters)
const generateSafeEmail = (username: string): string => {
    // Use Hex encoding of UTF-8 bytes to ensure safe email local part
    const encoder = new TextEncoder();
    const data = encoder.encode(username);
    const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex}@quizmaster.com`;
};

export const checkUserStatus = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_deleted, is_active')
    .eq('id', userId)
    .single();

  // If there's an error (e.g. network issue), we assume the user is valid to prevent accidental logout
  // We only return false if we explicitly get data saying the user is deleted or inactive
  if (error) {
    console.warn('Error checking user status, assuming active:', error);
    return true; 
  }

  if (!data) {
      return false; // User not found, should logout
  }

  // User is valid if NOT deleted AND IS active
  return !data.is_deleted && (data.is_active !== false); // Default to true if null
};

export const registerUser = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
  // Check if registration is allowed - this creates a circular dependency if we import from systemService?
  // No, systemService is independent. But we need to import it.
  // Ideally, we pass the setting value or check it here.
  // Let's import getSystemSetting dynamically or just duplicate the simple check to avoid circular dep if any?
  // Actually, authService depends on systemService is fine. systemService depends on nothing.
  
  // Dynamic import to be safe or standard import? Standard import is fine as systemService has no deps.
  const { getSystemSetting } = await import('./systemService');
  
  const allowRegistration = await getSystemSetting('allow_registration');
  if (allowRegistration === 'false') {
      return { success: false, message: '当前系统禁止新用户注册' };
  }

  // Use safe email generation to support Chinese usernames
  const email = generateSafeEmail(username);
  
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, role: UserRole.USER }
    }
  });

  if (signUpError) return { success: false, message: signUpError.message };
  
  if (signUpData.user) {
      // Create profile entry
      const { error: profileError } = await supabase.from('profiles').insert({
          id: signUpData.user.id,
          username,
          role: UserRole.USER
      });
      if (profileError) {
          console.error('Profile creation failed:', profileError);
          if (profileError.code !== '23505') {
             // Handle error
          }
      }
  }

  return { success: true, message: '注册成功' };
};

export const loginUser = async (username: string, password: string): Promise<{ success: boolean; user?: User; message?: string }> => {
  // Try with safe email (Hex format) first - for new users and Chinese usernames
  let email = generateSafeEmail(username);
  
  let { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  // If failed, and username is ASCII, try legacy email format (backward compatibility)
  if (error && /^[\x00-\x7F]*$/.test(username)) {
      const legacyEmail = `${username}@quizmaster.com`;
      const { data: legacyData, error: legacyError } = await supabase.auth.signInWithPassword({
          email: legacyEmail,
          password
      });
      
      if (!legacyError && legacyData.user) {
          data = legacyData;
          error = legacyError;
      }
  }

  if (error || !data.user) {
      console.error('Login error details:', error);
      return { success: false, message: '登录失败：' + (error?.message || '未知错误') };
  }

  // Fetch Profile
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
  
  if (profileError || !profile) {
      console.warn('Profile fetch failed, attempting fallback to metadata:', profileError);
      
      // Fallback to user_metadata if profile fetch fails
      const metadata = data.user.user_metadata;
      if (metadata && metadata.username) {
          return {
              success: true,
              user: {
                  id: data.user.id,
                  username: metadata.username,
                  role: (metadata.role as UserRole) || UserRole.USER,
                  createdAt: new Date(data.user.created_at).getTime(),
                  isActive: true // Assume active on network error to prevent lockout
              }
          };
      }
      
      return { success: false, message: '登录成功但无法获取用户信息，请稍后重试' };
  }

  // Check Active Status
  if (profile.is_active === false) { // Default to true if null/undefined
      await supabase.auth.signOut();
      return { success: false, message: '您的账户已被停用，请联系管理员开通' };
  }

  return {
      success: true,
      user: {
          id: profile.id,
          username: profile.username,
          role: profile.role as UserRole,
          createdAt: new Date(profile.created_at).getTime(),
          isActive: profile.is_active
      }
  };
};

export const adminAddUser = async (username: string, password: string, role: UserRole): Promise<{ success: boolean; message: string }> => {
    const { data, error } = await supabase.rpc('admin_create_user', {
        new_username: username,
        new_password: password,
        new_role: role
    });

    if (error) {
        console.error('Error creating user via admin RPC:', error);
        return { success: false, message: '创建失败: ' + error.message };
    }

    if (data.success) {
        return { success: true, message: '用户创建成功' };
    } else {
        return { success: false, message: data.message || '创建失败' };
    }
};

export const deleteUser = async (userId: string): Promise<{ success: boolean; error?: any }> => {
    const { data, error } = await supabase.rpc('admin_delete_user', { user_id: userId });
    
    if (error) {
        console.error('Error deleting user:', error);
        return { success: false, error };
    }
    
    if (data && data.success) {
        return { success: true };
    } else {
        return { success: false, error: { message: data?.message || '删除失败' } };
    }
};

export const updateUserRole = async (userId: string, newRole: UserRole): Promise<{ success: boolean; error?: any }> => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    
    if (error) {
        return { success: false, error };
    }
    return { success: true };
};

export const updateUserProfile = async (userId: string, updates: any): Promise<{ success: boolean; error?: any }> => {
    const { password, ...profileUpdates } = updates;
    
    // Update profile fields
    const { error } = await supabase.from('profiles').update({
        username: profileUpdates.username,
        role: profileUpdates.role,
        is_active: profileUpdates.isActive
    }).eq('id', userId);

    if (error) return { success: false, error };
    
    // Update password if provided
    if (password) {
        const { data, error: pwdError } = await supabase.rpc('admin_update_user_password', {
            target_user_id: userId,
            new_password: password
        });
        
        if (pwdError) return { success: false, error: pwdError };
        if (data && !data.success) return { success: false, error: { message: data.message } };
    }
    
    return { success: true };
};

export const getPaginatedUsers = async (page: number, limit: number): Promise<{ data: User[]; total: number }> => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    const { data, count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
        
    if (error) {
        console.error('Error fetching users:', error);
        return { data: [], total: 0 };
    }
    
    const mappedUsers: User[] = (data || []).map(p => ({
        id: p.id,
        username: p.username,
        role: p.role as UserRole,
        createdAt: new Date(p.created_at).getTime(),
        isActive: p.is_active
    }));
    
    return { data: mappedUsers, total: count || 0 };
};
