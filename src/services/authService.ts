import { supabase } from './supabaseClient';
import { User, UserRole } from '../types';
import { logger } from './loggerService';
import { getSystemSetting } from './systemService';

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
    // Only log if it's NOT a network error to avoid spamming logs during connection drops
    if (error.message && !error.message.includes('Failed to fetch')) {
        logger.warn('AUTH', 'Error checking user status, assuming active', { userId, error });
    }
    return true; 
  }

  if (!data) {
      logger.warn('AUTH', 'User not found in profiles during status check', { userId });
      return false; // User not found, should logout
  }

  // User is valid if NOT deleted AND IS active
  return !data.is_deleted && (data.is_active !== false); // Default to true if null
};

export const registerUser = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
  // Check if registration is allowed
  const allowRegistration = await getSystemSetting('allow_registration');
  if (allowRegistration === 'false') {
      logger.warn('AUTH', 'Blocked registration attempt (registration disabled)', { username });
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

  if (signUpError) {
      logger.warn('AUTH', 'Registration failed', { username, error: signUpError });
      return { success: false, message: signUpError.message };
  }
  
  if (signUpData.user) {
      // Create profile entry
      const { error: profileError } = await supabase.from('profiles').insert({
          id: signUpData.user.id,
          username,
          role: UserRole.USER,
          is_active: true,
          is_deleted: false
      });
      if (profileError) {
          // Check for duplicate key error (23505), which means the DB trigger already created the profile
          if (profileError.code === '23505') {
              logger.info('AUTH', 'Profile already created by system trigger', { username, userId: signUpData.user.id });
          } else {
              logger.error('AUTH', 'Profile creation failed after signup', { username, userId: signUpData.user.id }, profileError);
              // For other errors, we might want to return failure, but user is technically signed up in Auth
              // so we log it and let them proceed, potentially fixing profile later on login
          }
      } else {
          logger.info('AUTH', 'User registered successfully', { username, userId: signUpData.user.id });
      }
  }

  return { success: true, message: '注册成功' };
};

export const loginUser = async (username: string, password: string): Promise<{ success: boolean; user?: User; message?: string }> => {
  // Trim username to avoid accidental spaces
  const cleanUsername = username.trim();
  
  // Try with safe email (Hex format) first - for new users and Chinese usernames
  let email = generateSafeEmail(cleanUsername);
  
  let { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  // If failed, and username is ASCII, try legacy email format (backward compatibility)
  if (error && /^[\x00-\x7F]*$/.test(cleanUsername)) {
      const legacyEmail = `${cleanUsername}@quizmaster.com`;
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
      logger.warn('AUTH', 'Login failed', { username, error: error?.message });
      return { success: false, message: '登录失败：' + (error?.message || '未知错误') };
  }

  // Fetch Profile
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
  
  if (profileError || !profile) {
      logger.warn('AUTH', 'Profile fetch failed during login', { userId: data.user.id, error: profileError });
      
      // STRICT SECURITY: Do not fallback to metadata if profile is missing/error
      // This ensures we always check is_active/is_deleted status
      return { success: false, message: '登录失败：无法获取用户信息，请联系管理员' };
  }

  // Check Active Status
  if (profile.is_active === false) { // Default to true if null/undefined
      await supabase.auth.signOut();
      logger.warn('AUTH', 'Deactivated user attempted login', { username: cleanUsername });
      return { success: false, message: '您的账户已被停用，请联系管理员开通' };
  }

  logger.info('AUTH', 'User logged in', { username: cleanUsername, userId: profile.id, role: profile.role });

  return {
      success: true,
      user: {
          id: profile.id,
          username: profile.username,
          role: profile.role as UserRole,
          createdAt: new Date(profile.created_at).getTime(),
          isActive: profile.is_active,
          isDeleted: profile.is_deleted
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
        logger.error('AUTH', 'Admin failed to create user', { username, role }, error);
        return { success: false, message: '创建失败: ' + error.message };
    }

    if (data.success) {
        logger.info('AUTH', 'Admin created user', { username, role });
        return { success: true, message: '用户创建成功' };
    } else {
        logger.warn('AUTH', 'Admin create user returned failure', { username, role, message: data.message });
        return { success: false, message: data.message || '创建失败' };
    }
};

export const deleteUser = async (userId: string): Promise<{ success: boolean; error?: any }> => {
    const { data, error } = await supabase.rpc('admin_delete_user', { user_id: userId });
    
    if (error) {
        logger.error('AUTH', 'Admin failed to delete user', { targetUserId: userId }, error);
        return { success: false, error };
    }
    
    if (data && data.success) {
        logger.info('AUTH', 'Admin deleted user', { targetUserId: userId });
        return { success: true };
    } else {
        logger.warn('AUTH', 'Admin delete user returned failure', { targetUserId: userId, message: data?.message });
        return { success: false, error: { message: data?.message || '删除失败' } };
    }
};

export const updateUserRole = async (userId: string, newRole: UserRole): Promise<{ success: boolean; error?: any }> => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    
    if (error) {
        logger.error('AUTH', 'Admin failed to update user role', { targetUserId: userId, newRole }, error);
        return { success: false, error };
    }
    logger.info('AUTH', 'Admin updated user role', { targetUserId: userId, newRole });
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
    
    // Update auth.users (Email/Username sync and Password)
    // We always pass username if it exists in updates, to ensure auth.users email is synced
    if (profileUpdates.username || password) {
        const { data, error: rpcError } = await supabase.rpc('admin_update_user_details', {
            user_id: userId,
            new_username: profileUpdates.username || null,
            new_password: password || null
        });
        
        if (rpcError) return { success: false, error: rpcError };
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
        .neq('is_deleted', true) // Filter out deleted users (safer than eq false)
        .order('created_at', { ascending: false })
        .range(from, to);
        
    if (error) {
        console.error('Error fetching users:', error);
        throw error;
    }
    
    const mappedUsers: User[] = (data || []).map(p => ({
        id: p.id,
        username: p.username,
        role: p.role as UserRole,
        createdAt: new Date(p.created_at).getTime(),
        isActive: p.is_active,
        isDeleted: p.is_deleted
    }));
    
    return { data: mappedUsers, total: count || 0 };
};
