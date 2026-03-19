import { supabase } from './supabaseClient';
import { logger } from './loggerService';

export const getSystemSetting = async (key: string): Promise<string | null> => {
    const { data, error } = await supabase.from('system_settings').select('value').eq('key', key).single();
    if (error) {
        // Not finding a setting might be normal (e.g. first run), so we use debug/info or just ignore unless critical
        // Let's log warning only if it's not a "not found" error, or just suppress for getter to reduce noise
        return null;
    }
    if (!data) return null;
    return data.value;
};

export const updateSystemSetting = async (key: string, value: string): Promise<{ success: boolean; message: string }> => {
    const { error } = await supabase.from('system_settings').upsert({
        key,
        value,
        updated_at: Date.now()
    });
    
    if (error) {
        logger.error('SYSTEM', 'Error updating system setting', { key, value }, error);
        return { success: false, message: error.message };
    }
    
    logger.warn('SYSTEM', 'System setting updated', { key, value });
    return { success: true, message: '设置更新成功' };
};
