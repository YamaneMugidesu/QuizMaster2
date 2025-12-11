import { supabase } from './supabaseClient';
import { QuizResult, QuestionType } from '../types';
import { checkUserStatus } from './authService';
import { mapQuestionFromDB } from './questionService';

// Internal DB Type
interface DBResult {
    id: string;
    user_id: string;
    username: string;
    timestamp: number;
    score: number;
    max_score: number;
    passing_score: number;
    is_passed: boolean;
    total_questions: number;
    attempts: any[];
    config_id: string;
    config_name: string;
    status: 'completed' | 'pending_grading';
    duration: number;
}

const mapResultFromDB = (r: DBResult): QuizResult => ({
  id: r.id,
  userId: r.user_id,
  username: r.username,
  timestamp: r.timestamp,
  score: r.score,
  maxScore: r.max_score,
  passingScore: r.passing_score,
  isPassed: r.is_passed,
  totalQuestions: r.total_questions,
  attempts: r.attempts || [],
  configId: r.config_id,
  configName: r.config_name,
  status: r.status,
  duration: r.duration
});

// --- STATE ---
let resultsCache: Map<string, { data: any; total?: number; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const clearResultsCache = () => { resultsCache.clear(); };

// --- API ---

export const saveQuizResult = async (result: QuizResult): Promise<void> => {
  // Check if user is still active before saving
  const isActive = await checkUserStatus(result.userId);
  if (!isActive) {
    throw new Error('User account is deactivated or deleted. Cannot save result.');
  }

  const { error } = await supabase.from('quiz_results').insert([{
    user_id: result.userId,
    username: result.username,
    score: result.score,
    max_score: result.maxScore,
    passing_score: result.passingScore,
    is_passed: result.isPassed,
    total_questions: result.totalQuestions,
    attempts: result.attempts,
    config_id: result.configId,
    config_name: result.configName,
    timestamp: result.timestamp,
    status: result.status || 'completed',
    duration: result.duration
  }]);

  if (error) {
    console.error('Error saving quiz result:', error);
    throw error;
  }
  
  // Invalidate cache
  resultsCache.clear();
};

export const deleteQuizResult = async (id: string): Promise<void> => {
    resultsCache.clear(); // Invalidate cache
    const { error } = await supabase.from('quiz_results').delete().eq('id', id);
    if (error) {
        console.error('Error deleting quiz result:', error);
        throw error;
    }
};

export const getUserResults = async (userId: string): Promise<QuizResult[]> => {
  const cacheKey = `user_all_${userId}`;
  if (resultsCache.has(cacheKey)) {
      const cached = resultsCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
          return cached.data;
      }
  }

  const { data, error } = await supabase
    .from('quiz_results')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });

  if (error) return [];
  const mapped = (data as any[]).map(mapResultFromDB);
  resultsCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
  return mapped;
};

export const getPaginatedUserResultsByUserId = async (
  userId: string,
  page: number,
  limit: number
): Promise<{ data: QuizResult[]; total: number }> => {
  const cacheKey = `user_paginated_${userId}_${page}_${limit}`;
  if (resultsCache.has(cacheKey)) {
      const cached = resultsCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
          return { data: cached.data, total: cached.total || 0 };
      }
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await supabase
    .from('quiz_results')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching user results:', error);
    return { data: [], total: 0 };
  }

  const mapped = (data || []).map(item => mapResultFromDB(item as DBResult));
  const total = count || 0;
  
  resultsCache.set(cacheKey, { data: mapped, total, timestamp: Date.now() });

  return {
    data: mapped,
    total
  };
};

export const getAllUserResults = async (): Promise<QuizResult[]> => {
  const cacheKey = `all_results`;
  if (resultsCache.has(cacheKey)) {
      const cached = resultsCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
          return cached.data;
      }
  }

  const { data, error } = await supabase
    .from('quiz_results')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) return [];
  const mapped = (data as any[]).map(mapResultFromDB);
  resultsCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
  return mapped;
};

export const getPaginatedUserResults = async (
  page: number, 
  limit: number, 
  searchTerm?: string
): Promise<{ data: QuizResult[]; total: number }> => {
  const cacheKey = `paginated_results_${page}_${limit}_${searchTerm || ''}`;
  if (resultsCache.has(cacheKey)) {
      const cached = resultsCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
          return { data: cached.data, total: cached.total || 0 };
      }
  }

  let query = supabase
    .from('quiz_results')
    .select('*', { count: 'exact' })
    .order('timestamp', { ascending: false });

  if (searchTerm) {
    query = query.ilike('username', `%${searchTerm}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await query.range(from, to);

  if (error) {
    console.error('Error fetching paginated results:', error);
    return { data: [], total: 0 };
  }

  const mapped = (data || []).map(item => mapResultFromDB(item as DBResult));
  const total = count || 0;
  
  resultsCache.set(cacheKey, { data: mapped, total, timestamp: Date.now() });

  return {
    data: mapped,
    total
  };
};

export const gradeQuiz = async (attempts: { questionId: string; userAnswer: string; maxScore: number }[]): Promise<{ attempts: any[]; score: number }> => {
    const questionIds = attempts.map(a => a.questionId);
    
    // Fetch original questions with correct answers from DB
    const { data: questions, error } = await supabase
      .from('questions')
      .select('*')
      .in('id', questionIds);
  
    if (error) {
        console.error("Error fetching questions for grading:", error);
        throw error;
    }

    if (!questions || questions.length === 0) {
        // If we tried to grade questions but found none, that's suspicious if input wasn't empty
        if (attempts.length > 0) {
            throw new Error("Failed to retrieve questions for grading (possible network issue or questions deleted)");
        }
        return { attempts: [], score: 0 };
    }
  
    const mappedQuestions = (questions as any[]).map(mapQuestionFromDB);
    
    const gradedAttempts = attempts.map(attempt => {
      const q = mappedQuestions.find(mq => mq.id === attempt.questionId);
      if (!q) {
          return { 
              ...attempt, 
              isCorrect: false, 
              score: 0, 
              correctAnswerText: 'Error loading question',
              explanation: ''
          };
      }
  
      let isCorrect = false;
      const userAnswer = attempt.userAnswer || '';
  
      // Grading Logic (Mirrors QuizTaker.tsx)
      if (q.type === QuestionType.SHORT_ANSWER && q.needsGrading) {
          isCorrect = false; // Mark as false/pending for manual grading
      } else if (q.type === QuestionType.MULTIPLE_SELECT) {
          try {
             const userArr = JSON.parse(userAnswer || '[]');
             const correctArr = JSON.parse(q.correctAnswer || '[]');
             userArr.sort();
             correctArr.sort();
             isCorrect = JSON.stringify(userArr) === JSON.stringify(correctArr);
          } catch {
              isCorrect = false;
          }
      } else if (q.type === QuestionType.MULTIPLE_CHOICE || q.type === QuestionType.TRUE_FALSE) {
          isCorrect = userAnswer === q.correctAnswer;
      } else if (q.type === QuestionType.FILL_IN_THE_BLANK) {
          let correctParts: string[] = [];
          let userParts: string[] = [];
          try {
              const parsed = JSON.parse(q.correctAnswer || '[]');
              if (Array.isArray(parsed)) correctParts = parsed;
              else correctParts = [q.correctAnswer || ''];
          } catch {
              if (q.correctAnswer?.includes(';&&;')) correctParts = q.correctAnswer.split(';&&;');
              else correctParts = [q.correctAnswer || ''];
          }
          try {
              const parsed = JSON.parse(userAnswer || '[]');
              if (Array.isArray(parsed)) userParts = parsed;
              else userParts = userAnswer ? [userAnswer] : [];
          } catch {
              userParts = userAnswer ? [userAnswer] : [];
          }
          
          if (userParts.length !== correctParts.length) {
              isCorrect = false;
          } else {
              isCorrect = correctParts.every((cPart, idx) => {
                  const uPart = userParts[idx] || '';
                  const cleanCorrect = cPart.replace(/<[^>]+>/g, '').trim().toLowerCase();
                  const cleanUser = uPart.trim().toLowerCase();
                  return cleanUser === cleanCorrect;
              });
          }
      } else {
          // Short Answer Auto-Grade
          const cleanCorrectAnswer = (q.correctAnswer || '').replace(/<[^>]+>/g, '').trim().toLowerCase();
          const cleanUserAnswer = userAnswer.trim().toLowerCase();
          isCorrect = cleanUserAnswer === cleanCorrectAnswer;
      }
  
      return {
         ...attempt,
         isCorrect,
         score: isCorrect ? attempt.maxScore : 0,
         correctAnswerText: q.correctAnswer, // Restore correct answer for review
         explanation: q.explanation
      };
    });
  
    const totalScore = gradedAttempts.reduce((sum, a) => sum + (a.score || 0), 0);
    
    return { attempts: gradedAttempts, score: totalScore };
  };

export const gradeQuizResult = async (resultId: string, attempts: any[], finalScore: number, isPassed: boolean): Promise<void> => {
  resultsCache.clear(); // Invalidate results cache
  const { error } = await supabase
    .from('quiz_results')
    .update({
      attempts: attempts,
      score: finalScore,
      is_passed: isPassed,
      status: 'completed'
    })
    .eq('id', resultId);

  if (error) console.error('Error grading result:', error);
};
