import { supabase } from './supabaseClient';

export type LogLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type LogCategory = 'AUTH' | 'AI' | 'DB' | 'SYSTEM' | 'USER_ACTION';

interface LogEntry {
    level: LogLevel;
    category: LogCategory;
    message: string;
    details?: any;
    user_id?: string;
}

class LoggerService {
    /**
     * Internal method to write log to Supabase
     */
    private async writeLog(entry: LogEntry) {
        try {
            // Get current user if not provided
            let userId = entry.user_id;
            
            // Try to extract from details if not in entry
            if (!userId && entry.details && entry.details.userId) {
                userId = entry.details.userId;
            }

            if (!userId) {
                const { data: { session } } = await supabase.auth.getSession();
                userId = session?.user?.id;
            }

            const { error } = await supabase.from('system_logs').insert({
                level: entry.level,
                category: entry.category,
                message: entry.message,
                details: entry.details ? entry.details : null, // Store as JSONB
                user_id: userId,
                created_at: Date.now()
            });

            if (error) {
                // Fallback to console if DB logging fails
                console.error('Failed to write system log:', error);
            }
        } catch (e) {
            console.error('Logger service exception:', e);
        }
    }

    /**
     * Log standard information (Audit trail)
     */
    async info(category: LogCategory, message: string, details?: any) {
        console.log(`[INFO][${category}] ${message}`, details || '');
        await this.writeLog({ level: 'INFO', category, message, details });
    }

    /**
     * Log a warning (Potential issues)
     */
    async warn(category: LogCategory, message: string, details?: any) {
        console.warn(`[WARN][${category}] ${message}`, details || '');
        await this.writeLog({ level: 'WARNING', category, message, details });
    }

    /**
     * Log an error (Operation failed)
     */
    async error(category: LogCategory, message: string, details?: any, error?: any) {
        console.error(`[ERROR][${category}] ${message}`, details || '', error || '');
        const logDetails = {
            ...details,
            error_obj: error ? (error instanceof Error ? { message: error.message, stack: error.stack } : error) : undefined
        };
        await this.writeLog({ level: 'ERROR', category, message, details: logDetails });
    }

    /**
     * Log a critical failure (System functionality blocked)
     */
    async critical(category: LogCategory, message: string, details?: any, error?: any) {
        console.error(`[CRITICAL][${category}] ${message}`, details || '', error || '');
        const logDetails = {
            ...details,
            error_obj: error ? (error instanceof Error ? { message: error.message, stack: error.stack } : error) : undefined
        };
        await this.writeLog({ level: 'CRITICAL', category, message, details: logDetails });
    }

    /**
     * Retrieve logs for System Monitor
     * Only accessible by Super Admins (enforced by RLS)
     */
    async getSystemLogs(page: number = 1, limit: number = 20, filter: LogFilter = {}): Promise<{ data: SystemLog[], total: number }> {
        try {
            let query = supabase
                .from('system_logs')
                .select(`
                    *,
                    profiles:user_id (username)
                `, { count: 'exact' });

            if (filter.level) {
                query = query.eq('level', filter.level);
            }

            if (filter.category) {
                query = query.eq('category', filter.category);
            }

            if (filter.search) {
                query = query.ilike('message', `%${filter.search}%`);
            }

            const from = (page - 1) * limit;
            const to = from + limit - 1;

            const { data, count, error } = await query
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) {
                console.error('Failed to fetch system logs:', error);
                throw error;
            }

            const logs: SystemLog[] = (data || []).map(row => ({
                id: row.id,
                level: row.level as LogLevel,
                category: row.category as LogCategory,
                message: row.message,
                details: row.details,
                userId: row.user_id,
                username: row.profiles?.username || 'Unknown/System',
                createdAt: row.created_at,
                isResolved: row.is_resolved
            }));

            return { data: logs, total: count || 0 };

        } catch (e) {
            console.error('getSystemLogs exception:', e);
            return { data: [], total: 0 };
        }
    }

    /**
     * Delete system logs (Super Admin only)
     * Hard delete as requested
     */
    async deleteLogs(ids: string[]): Promise<void> {
        try {
            const { error } = await supabase
                .from('system_logs')
                .delete()
                .in('id', ids);

            if (error) {
                throw error;
            }
            
            // Log this action (but don't fail if logging fails to prevent infinite loop if logging is broken)
            // We should use console here or a very safe call
            console.log(`[AUDIT] Super Admin deleted ${ids.length} logs`);
            
        } catch (e) {
            console.error('Failed to delete logs:', e);
            throw e;
        }
    }
}

export const logger = new LoggerService();

export interface LogFilter {
    level?: LogLevel;
    category?: LogCategory;
    search?: string;
    limit?: number;
    offset?: number;
}

export interface SystemLog {
    id: string;
    level: LogLevel;
    category: LogCategory;
    message: string;
    details?: any;
    userId?: string;
    username?: string;
    createdAt: number;
    isResolved: boolean;
}


