import { supabase } from './supabaseClient';

export const getSystemSetting = async (key: string): Promise<string | null> => {
    const { data, error } = await supabase.from('system_settings').select('value').eq('key', key).single();
    if (error || !data) return null;
    return data.value;
};

export const updateSystemSetting = async (key: string, value: string): Promise<{ success: boolean; message: string }> => {
    const { error } = await supabase.from('system_settings').upsert({
        key,
        value,
        updated_at: Date.now()
    });
    
    if (error) {
        console.error('Error updating setting:', error);
        return { success: false, message: error.message };
    }
    return { success: true, message: '设置更新成功' };
};
