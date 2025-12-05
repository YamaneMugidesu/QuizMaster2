
import { Question, QuestionType, User, UserRole, QuizResult, Difficulty, QuizConfig, GradeLevel, QuestionCategory } from '../types';
import { supabase } from './supabaseClient';

// --- HELPER: MAP DB TO FRONTEND ---
const mapQuestionFromDB = (q: any): Question => ({
  id: q.id,
  type: q.type as QuestionType,
  text: q.text,
  imageUrls: q.image_urls || [],
  options: q.options || undefined,
  correctAnswer: q.correct_answer,
  subject: q.subject,
  gradeLevel: q.grade_level as GradeLevel,
  difficulty: q.difficulty as Difficulty,
  category: q.category as QuestionCategory || QuestionCategory.BASIC,
  createdAt: q.created_at,
  isDisabled: q.is_disabled,
  score: q.score,
  needsGrading: q.needs_grading,
  explanation: q.explanation
});

const mapConfigFromDB = (c: any): QuizConfig => ({
  id: c.id,
  name: c.name,
  description: c.description,
  passingScore: c.passing_score,
  parts: c.parts || [],
  totalQuestions: c.total_questions,
  createdAt: c.created_at,
  quizMode: c.quiz_mode || 'practice'
});

const mapResultFromDB = (r: any): QuizResult => ({
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

// --- QUESTIONS API ---

export const getQuestions = async (): Promise<Question[]> => {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching questions:', error);
    return [];
  }
  return data.map(mapQuestionFromDB);
};

export const saveQuestion = async (question: Question): Promise<void> => {
  const { id, ...rest } = question;
  
  const dbPayload = {
    type: rest.type,
    text: rest.text,
    image_urls: rest.imageUrls,
    options: rest.options,
    correct_answer: rest.correctAnswer,
    subject: rest.subject,
    grade_level: rest.gradeLevel,
    difficulty: rest.difficulty,
    category: rest.category,
    created_at: rest.createdAt,
    is_disabled: rest.isDisabled || false,
    score: rest.score,
    needs_grading: rest.needsGrading,
    explanation: rest.explanation
  };

  const { error } = await supabase.from('questions').insert(dbPayload);
  if (error) console.error('Error saving question:', error);
};

export const updateQuestion = async (updatedQuestion: Question): Promise<void> => {
  const dbPayload = {
    type: updatedQuestion.type,
    text: updatedQuestion.text,
    image_urls: updatedQuestion.imageUrls,
    options: updatedQuestion.options,
    correct_answer: updatedQuestion.correctAnswer,
    subject: updatedQuestion.subject,
    grade_level: updatedQuestion.gradeLevel,
    difficulty: updatedQuestion.difficulty,
    category: updatedQuestion.category,
    // created_at: updatedQuestion.createdAt, // Don't update created_at
    is_disabled: updatedQuestion.isDisabled,
    score: updatedQuestion.score,
    needs_grading: updatedQuestion.needsGrading,
    explanation: updatedQuestion.explanation
  };

  const { error } = await supabase
    .from('questions')
    .update(dbPayload)
    .eq('id', updatedQuestion.id);
    
  if (error) console.error('Error updating question:', error);
};

export const toggleQuestionVisibility = async (id: string): Promise<void> => {
  const { data } = await supabase.from('questions').select('is_disabled').eq('id', id).single();
  if (data) {
    await supabase.from('questions').update({ is_disabled: !data.is_disabled }).eq('id', id);
  }
};

export const deleteQuestion = async (id: string): Promise<void> => {
  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) console.error('Error deleting question:', error);
};

// --- CONFIGURATION API ---

export const getQuizConfigs = async (): Promise<QuizConfig[]> => {
  const { data, error } = await supabase.from('quiz_configs').select('*');
  if (error) {
    console.error('Error fetching configs:', error);
    return [];
  }
  return data.map(mapConfigFromDB);
};

export const getQuizConfig = async (id: string): Promise<QuizConfig | null> => {
  const { data, error } = await supabase.from('quiz_configs').select('*').eq('id', id).single();
  if (error || !data) {
    if (error) console.error('Error fetching config:', error);
    return null;
  }
  return mapConfigFromDB(data);
};

export const saveQuizConfig = async (config: QuizConfig): Promise<void> => {
  const { id, ...rest } = config;
  const dbPayload = {
    name: rest.name,
    description: rest.description,
    passing_score: rest.passingScore,
    parts: rest.parts,
    total_questions: rest.totalQuestions,
    created_at: rest.createdAt,
    quiz_mode: rest.quizMode || 'practice'
  };

  if (id && id.length > 20) {
      const { error } = await supabase.from('quiz_configs').update(dbPayload).eq('id', id);
      if(error) console.error(error);
  } else {
      const { error } = await supabase.from('quiz_configs').insert(dbPayload);
      if(error) console.error(error);
  }
};

export const deleteQuizConfig = async (id: string): Promise<void> => {
    await supabase.from('quiz_configs').delete().eq('id', id);
}

export const getAvailableQuestionCount = async (
    subjects: string[], 
    difficulties: Difficulty[], 
    gradeLevels: GradeLevel[],
    types: QuestionType[] = [],
    categories: QuestionCategory[] = []
): Promise<number> => {
    let query = supabase.from('questions').select('id', { count: 'exact', head: true }).eq('is_disabled', false);

    if (subjects.length > 0) query = query.in('subject', subjects);
    if (difficulties.length > 0) query = query.in('difficulty', difficulties);
    if (gradeLevels.length > 0) query = query.in('grade_level', gradeLevels);
    if (types.length > 0) query = query.in('type', types);
    if (categories.length > 0) query = query.in('category', categories);

    const { count, error } = await query;
    return count || 0;
};

export const generateQuiz = async (configId: string): Promise<{ questions: Question[], configName: string, passingScore: number }> => {
    const { data: config } = await supabase.from('quiz_configs').select('*').eq('id', configId).single();
    
    if (!config) {
        return { questions: [], configName: 'Unknown', passingScore: 0 };
    }

    const mappedConfig = mapConfigFromDB(config);
    let allQuestions: Question[] = [];

    for (const part of mappedConfig.parts) {
        let query = supabase.from('questions').select('*').eq('is_disabled', false);
        
        if (part.subjects && part.subjects.length > 0) query = query.in('subject', part.subjects);
        if (part.difficulties && part.difficulties.length > 0) query = query.in('difficulty', part.difficulties);
        if (part.gradeLevels && part.gradeLevels.length > 0) query = query.in('grade_level', part.gradeLevels);
        if (part.categories && part.categories.length > 0) query = query.in('category', part.categories);
        
        // Fix: Use questionTypes (from interface) instead of types
        // Also support 'types' for backward compatibility if it exists in DB
        const types = (part as any).questionTypes || (part as any).types;
        if (types && types.length > 0) query = query.in('type', types);

        const { data: questions } = await query;
        
        if (questions) {
            const mappedQuestions = questions.map(mapQuestionFromDB);
            // Shuffle and slice
            const shuffled = mappedQuestions.sort(() => 0.5 - Math.random());
            
            // Apply score from config part
            const selectedQuestions = shuffled.slice(0, part.count).map(q => ({
                ...q,
                score: part.score // Override question score with config part score
            }));

            allQuestions = [...allQuestions, ...selectedQuestions];
        }
    }

    return { 
        questions: allQuestions, 
        configName: mappedConfig.name, 
        passingScore: mappedConfig.passingScore 
    };
};

// --- USER API ---

export const registerUser = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
  const email = `${username}@quizmaster.com`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, role: UserRole.USER }
    }
  });

  if (error) return { success: false, message: error.message };
  
  if (data.user) {
      // Create profile entry
      const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          username,
          role: UserRole.USER
      });
      if (profileError) console.error('Profile creation failed:', profileError);
  }

  return { success: true, message: '注册成功' };
};

export const loginUser = async (username: string, password: string): Promise<{ success: boolean; user?: User; message?: string }> => {
  const email = `${username}@quizmaster.com`;
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.user) {
      return { success: false, message: '登录失败：' + (error?.message || '未知错误') };
  }

  // Fetch Profile
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
  
  if (!profile) {
      return { success: false, message: '用户档案不存在' };
  }

  return {
      success: true,
      user: {
          id: profile.id,
          username: profile.username,
          role: profile.role as UserRole,
          createdAt: profile.created_at
      }
  };
};

export const adminAddUser = async (username: string, password: string, role: UserRole): Promise<{ success: boolean; message: string }> => {
    return { success: false, message: "请直接在前台使用注册功能" };
};

export const deleteUser = async (userId: string): Promise<void> => {
    await supabase.from('profiles').delete().eq('id', userId);
};

export const updateUserRole = async (userId: string, newRole: UserRole): Promise<void> => {
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
};

export const getAllUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) return [];
  return data.map((p: any) => ({
    id: p.id,
    username: p.username,
    role: p.role as UserRole,
    createdAt: p.created_at
  }));
};

// --- RESULTS HISTORY ---

export const saveQuizResult = async (result: QuizResult): Promise<void> => {
  const dbPayload = {
      user_id: result.userId,
      username: result.username,
      timestamp: result.timestamp,
      score: result.score,
      max_score: result.maxScore,
      passing_score: result.passingScore,
      is_passed: result.isPassed,
      total_questions: result.totalQuestions,
      attempts: result.attempts,
      config_id: result.configId,
      config_name: result.configName,
      status: result.status || 'completed',
      duration: result.duration
  };
  
  const { error } = await supabase.from('quiz_results').insert(dbPayload);
  if (error) console.error('Error saving result:', error);
};

export const getUserResults = async (userId: string): Promise<QuizResult[]> => {
  const { data, error } = await supabase
    .from('quiz_results')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });

  if (error) return [];
  return data.map(mapResultFromDB);
};

export const getAllUserResults = async (): Promise<QuizResult[]> => {
  const { data, error } = await supabase
    .from('quiz_results')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) return [];
  return data.map(mapResultFromDB);
};

export const gradeQuizResult = async (resultId: string, attempts: any[], finalScore: number, isPassed: boolean): Promise<void> => {
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
