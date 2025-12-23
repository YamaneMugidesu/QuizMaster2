
export enum QuestionType {
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE', // 单选
  MULTIPLE_SELECT = 'MULTIPLE_SELECT', // 多选
  TRUE_FALSE = 'TRUE_FALSE',           // 判断
  SHORT_ANSWER = 'SHORT_ANSWER',       // 简答
  FILL_IN_THE_BLANK = 'FILL_IN_THE_BLANK' // 填空
}

export enum Difficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD'
}

export enum GradeLevel {
  PRIMARY = 'PRIMARY',   // 小学
  JUNIOR = 'JUNIOR',     // 初中
  SENIOR = 'SENIOR'      // 高中
}

export enum QuestionCategory {
  BASIC = '基础知识',
  MISTAKE = '易错题',
  EXPLANATION = '写解析',
  STANDARD = '标准理解'
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  imageUrls?: string[]; // Array of Base64 strings or URLs
  options?: string[]; // Only for MULTIPLE_CHOICE and MULTIPLE_SELECT
  correctAnswer: string; // For MULTIPLE_SELECT, this is a JSON stringified array of correct options
  subject: string;
  gradeLevel: GradeLevel;
  difficulty: Difficulty;
  category?: QuestionCategory; // New field
  createdAt: number;
  isDisabled?: boolean;
  score?: number; // Runtime score assigned by quiz config
  needsGrading?: boolean; // For SHORT_ANSWER: requires manual grading
  explanation?: string; // New field for answer explanation
  blankCount?: number; // Runtime field for FILL_IN_THE_BLANK questions to indicate number of inputs
  isDeleted?: boolean; // New field for soft delete status
  quizPartName?: string; // Runtime field: which part of the quiz config this question belongs to
}

export interface QuizAttempt {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  questionText?: string; // Snapshot of text
  questionImageUrls?: string[]; // Snapshot of images
  correctAnswerText?: string; // Snapshot of correct answer
  explanation?: string; // Snapshot of explanation
  score?: number; // Score for this specific question
  maxScore?: number; // Max score for this question
  manualGrading?: boolean; // Snapshot of needsGrading
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN', // 超级管理员
  ADMIN = 'ADMIN',             // 普通管理员
  USER = 'USER'                // 普通用户
}

export interface User {
  id: string;
  username: string;
  password?: string;
  role: UserRole;
  createdAt: number;
  isActive?: boolean; // New field for user status (true: active, false: suspended)
  isDeleted?: boolean; // New field for soft delete status
}

export interface QuizResult {
  id: string;
  userId: string;
  username: string;
  timestamp: number;
  score: number; // Total points earned
  maxScore?: number; // Total possible points (weighted)
  passingScore?: number; // Snapshot of passing score required
  isPassed?: boolean; // Whether the user passed
  totalQuestions: number;
  attempts: QuizAttempt[];
  configId?: string; // Record which exam config was used
  configName?: string;
  status?: 'completed' | 'pending_grading';
  duration?: number; // Time taken in seconds
  config?: QuizConfig; // Optional full config object for immediate display
}

// --- Quiz Configuration Types ---

export interface QuizPartConfig {
  id: string;
  name: string; // e.g., "Part 1: Basic Math"
  
  // Filter Criteria (Arrays for multi-select, empty means ALL)
  subjects: string[]; 
  difficulties: Difficulty[];
  gradeLevels: GradeLevel[];
  questionTypes: QuestionType[];
  categories?: QuestionCategory[]; // New filter
  
  count: number; // Number of questions in this part
  score: number; // Points per question in this part
}

export interface QuestionFilters {
  search?: string;
  subject?: string;
  gradeLevel?: GradeLevel;
  type?: QuestionType;
  difficulty?: Difficulty;
  category?: QuestionCategory;
  isDeleted?: boolean;
}

// --- Shared Constants ---
export const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '地理', '政治', '历史', '科学', '综合'];

export interface QuestionFormData {
  type: QuestionType;
  text: string;
  imageUrls: string[];
  options: string[];
  correctAnswer: string;
  subject: string;
  difficulty: Difficulty;
  gradeLevel: GradeLevel;
  category: QuestionCategory;
  needsGrading?: boolean;
  explanation?: string;
}

export interface QuizConfig {
  id: string;
  name: string;
  description?: string;
  passingScore: number; // Minimum score to pass
  parts: QuizPartConfig[];
  totalQuestions: number; // Calculated automatically
  createdAt: number;
  quizMode?: 'practice' | 'exam'; // 'practice': show details, 'exam': hide details (unless admin)
  isPublished?: boolean; // Whether the quiz is available to regular users
  isDeleted?: boolean; // New field for soft delete status
}
