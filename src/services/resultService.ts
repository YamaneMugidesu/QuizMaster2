import { supabase } from './supabaseClient';
import { QuizResult, QuestionType } from '../types';
import { checkUserStatus } from './authService';
import { mapQuestionFromDB } from './questionService';
import { logger } from './loggerService';

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
// Removed manual cache variables

// --- API ---

export const saveQuizResult = async (result: QuizResult): Promise<QuizResult> => {
  // Check if user is still active before saving
  const isActive = await checkUserStatus(result.userId);
  if (!isActive) {
    throw new Error('User account is deactivated or deleted. Cannot save result.');
  }

  const { data, error } = await supabase.from('quiz_results').insert([{
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
  }]).select().single();

  if (error) {
    logger.error('USER_ACTION', 'Error saving quiz result', { userId: result.userId, score: result.score }, error);
    throw error;
  }
  
  const savedResult = mapResultFromDB(data as DBResult);

  await logger.info('USER_ACTION', 'Quiz result saved', { 
    userId: result.userId, 
    username: result.username,
    configName: result.configName,
    score: result.score, 
    passed: result.isPassed,
    duration: result.duration,
    totalQuestions: result.totalQuestions,
    resultId: savedResult.id
  });

  return savedResult;
};

export const deleteQuizResult = async (id: string): Promise<void> => {
    const { error } = await supabase.from('quiz_results').delete().eq('id', id);
    if (error) {
        logger.error('USER_ACTION', 'Error deleting quiz result', { resultId: id }, error);
        throw error;
    }
    
    await logger.warn('USER_ACTION', 'Quiz result deleted', { resultId: id });
};

export const getUserResults = async (userId: string): Promise<QuizResult[]> => {
  const { data, error } = await supabase
    .from('quiz_results')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('Error fetching user results:', error);
    throw error;
  }
  const mapped = (data as any[]).map(mapResultFromDB);
  return mapped;
};

export const getPaginatedUserResultsByUserId = async (
  userId: string,
  page: number,
  limit: number
): Promise<{ data: QuizResult[]; total: number }> => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Optimize query: Use View to get lightweight attempts (scores only)
  const { data, count, error } = await supabase
    .from('quiz_results_summary_view')
    .select('id, user_id, username, timestamp, score, max_score, passing_score, is_passed, total_questions, config_id, config_name, status, duration, attempts', { count: 'exact' })
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching user results:', error);
    throw error;
  }

  const mapped = (data || []).map(item => mapResultFromDB(item as DBResult));
  const total = count || 0;
  
  return {
    data: mapped,
    total
  };
};

export const getAllUserResults = async (): Promise<QuizResult[]> => {
  const { data, error } = await supabase
    .from('quiz_results')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('Error fetching all results:', error);
    throw error;
  }
  const mapped = (data as any[]).map(mapResultFromDB);
  return mapped;
};

export const getPaginatedUserResults = async (
  page: number, 
  limit: number, 
  searchTerm?: string
): Promise<{ data: QuizResult[]; total: number }> => {
  // Optimize query: Use View to get lightweight attempts (scores only)
  let query = supabase
    .from('quiz_results_summary_view')
    .select('id, user_id, username, timestamp, score, max_score, passing_score, is_passed, total_questions, config_id, config_name, status, duration, attempts', { count: 'exact' })
    .order('timestamp', { ascending: false });

  if (searchTerm) {
    query = query.ilike('username', `%${searchTerm}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await query.range(from, to);

  if (error) {
    console.error('Error fetching paginated results:', error);
    throw error;
  }

  const mapped = (data || []).map(item => mapResultFromDB(item as DBResult));
  const total = count || 0;
  
  return {
    data: mapped,
    total
  };
};

export const getResultById = async (id: string): Promise<QuizResult | null> => {
  const { data, error } = await supabase
    .from('quiz_results')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching result by id:', error);
    return null;
  }

  return mapResultFromDB(data as DBResult);
};

// Helper: Normalize answer for comparison
// 1. Removes HTML tags
// 2. Removes invisible characters (ZWSP, etc)
// 3. Handles Chinese text spacing (removes all spaces in Chinese context)
// 4. Standardizes basic punctuation
const normalizeAnswer = (str: string): string => {
    if (!str) return '';
    
    // Remove HTML tags
    let s = str.replace(/<[^>]+>/g, '');
    
    // Remove invisible characters (Zero Width Space, etc.)
    // \u200B: Zero Width Space
    // \uFEFF: Zero Width No-Break Space / BOM
    // \u00A0: Non-Breaking Space
    s = s.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ');
    
    // Trim and Lowercase
    s = s.trim().toLowerCase();
    
    // Check if string contains Chinese characters or punctuation
    // \u4e00-\u9fa5: CJK Unified Ideographs
    // \u3000-\u303f: CJK Symbols and Punctuation
    // \uff00-\uffef: Fullwidth ASCII variants
    const hasChinese = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(s);
    
    if (hasChinese) {
        // For Chinese text, spaces are usually irrelevant formatting issues
        // Remove ALL whitespace to ensure "字 符" matches "字符"
        s = s.replace(/\s+/g, '');
        
        // Normalize common punctuation variants if needed? 
        // For now, strict whitespace removal fixes 99% of "looks same" issues
        
        // Optional: Normalize Chinese punctuation to English if we want extreme leniency
        // But for a language quiz, punctuation matters.
        // We only strip spaces.
    } else {
        // For non-Chinese text, collapse multiple spaces to single space
        s = s.replace(/\s+/g, ' ');
    }
    
    return s;
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
                  const cleanCorrect = normalizeAnswer(cPart);
                  const cleanUser = normalizeAnswer(uPart);
                  return cleanUser === cleanCorrect;
              });
          }
      } else {
          // Short Answer Auto-Grade
          const cleanCorrectAnswer = normalizeAnswer(q.correctAnswer || '');
          const cleanUserAnswer = normalizeAnswer(userAnswer);
          
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

export const gradeQuizResult = async (
  resultId: string, 
  attempts: any[], 
  finalScore: number, 
  isPassed: boolean,
  logContext?: { 
      type: 'SINGLE_UPDATE' | 'BATCH_GRADING', 
      questionId?: string, 
      oldScore?: number, 
      newScore?: number 
  }
): Promise<void> => {
  const { error } = await supabase
    .from('quiz_results')
    .update({
      attempts: attempts,
      score: finalScore,
      is_passed: isPassed,
      status: 'completed'
    })
    .eq('id', resultId);

  if (error) {
    logger.error('USER_ACTION', 'Error grading result', { resultId, finalScore }, error);
    throw error;
  }
  
  if (logContext?.type === 'SINGLE_UPDATE') {
      await logger.info('USER_ACTION', 'Admin updated single question score', { 
          resultId, 
          questionId: logContext.questionId,
          oldScore: logContext.oldScore,
          newScore: logContext.newScore,
          finalScore,
          isPassed
      });
  } else {
      await logger.info('USER_ACTION', 'Admin graded/updated quiz result', { resultId, finalScore, isPassed });
  }
};
