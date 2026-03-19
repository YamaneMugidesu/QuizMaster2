import { supabase } from './supabaseClient';
import { Difficulty, GradeLevel, QuestionType, QuestionCategory } from '../types';

// Re-export from modular services
export * from './systemService';
export * from './authService';
export * from './questionService';
export * from './quizConfigService';
export * from './resultService';

export const getAvailableQuestionCount = async (
    subjects: string[], 
    difficulties: Difficulty[], 
    gradeLevels: GradeLevel[], 
    types: QuestionType[],
    categories?: QuestionCategory[],
    contentCategories?: string[]
): Promise<number> => {
    try {
        let query = supabase.from('questions')
            .select('id', { count: 'exact', head: true })
            .neq('is_deleted', true)
            .eq('is_disabled', false);

        if (subjects && subjects.length > 0) {
            query = query.in('subject', subjects);
        }
        if (difficulties && difficulties.length > 0) {
            query = query.in('difficulty', difficulties);
        }
        if (gradeLevels && gradeLevels.length > 0) {
            query = query.in('grade_level', gradeLevels);
        }
        if (types && types.length > 0) {
            query = query.in('type', types);
        }
        if (categories && categories.length > 0) {
            query = query.in('category', categories);
        }
        if (contentCategories && contentCategories.length > 0) {
            query = query.in('content_category', contentCategories);
        }

        const { count, error } = await query;
        
        if (error) {
            console.error('Error checking availability:', error);
            return 0;
        }
        
        return count || 0;
    } catch (error) {
        console.error('Exception checking availability:', error);
        return 0;
    }
};
