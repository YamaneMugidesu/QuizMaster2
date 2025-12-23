import useSWR, { mutate } from 'swr';
import { getQuestions, getQuestionsByIds } from '../services/questionService';
import { getQuizConfigs, getQuizConfig } from '../services/quizConfigService';
import { getPaginatedUserResults, getPaginatedUserResultsByUserId } from '../services/resultService';
import { getPaginatedUsers } from '../services/authService';
import { QuestionFilters, Question, QuizConfig, QuizResult, User } from '../types';

// Fetcher wrapper to match SWR signature
// Note: SWR passes the key as arguments to the fetcher
const questionFetcher = async ([_key, page, limit, filters]: [string, number, number, QuestionFilters]) => {
    return getQuestions(page, limit, filters);
};

export const useQuestions = (page: number, limit: number, filters: QuestionFilters, enabled: boolean = true) => {
    const { data, error, isLoading, mutate } = useSWR(
        enabled ? ['questions', page, limit, filters] : null,
        questionFetcher,
        {
            keepPreviousData: true, // Keep showing old data while fetching new page
            revalidateOnFocus: false, // Don't aggressive revalidate for questions list
        }
    );

    return {
        questions: data?.data || [],
        total: data?.total || 0,
        isLoading,
        isError: error,
        mutate
    };
};

const configFetcher = async ([_key, includeDeleted, onlyDeleted]: [string, boolean, boolean]) => {
    return getQuizConfigs(includeDeleted, onlyDeleted);
};

export const useQuizConfigs = (enabled: boolean = true, includeDeleted: boolean = false, onlyDeleted: boolean = false) => {
    const { data, error, isLoading, mutate } = useSWR(
        enabled ? ['quizConfigs', includeDeleted, onlyDeleted] : null,
        configFetcher
    );

    return {
        configs: data || [],
        isLoading,
        isError: error,
        mutate
    };
};

const resultsFetcher = async ([_key, page, limit, search]: [string, number, number, string]) => {
    return getPaginatedUserResults(page, limit, search);
};

export const useAllResults = (page: number, limit: number, search: string, enabled: boolean = true) => {
    const { data, error, isLoading, mutate } = useSWR(
        enabled ? ['allResults', page, limit, search] : null,
        resultsFetcher,
        {
             keepPreviousData: true
        }
    );

    return {
        results: data?.data || [],
        total: data?.total || 0,
        isLoading,
        isError: error,
        mutate
    };
};

const userResultsFetcher = async ([_key, userId, page, limit]: [string, string, number, number]) => {
    return getPaginatedUserResultsByUserId(userId, page, limit);
};

export const useUserResults = (userId: string | undefined, page: number, limit: number) => {
    const { data, error, isLoading, mutate } = useSWR(
        userId ? ['userResults', userId, page, limit] : null,
        userResultsFetcher,
        {
            keepPreviousData: true
        }
    );

    return {
        results: data?.data || [],
        total: data?.total || 0,
        isLoading,
        isError: error,
        mutate
    };
};

const usersFetcher = async ([_key, page, limit]: [string, number, number]) => {
    return getPaginatedUsers(page, limit);
};

export const useUsers = (page: number, limit: number, enabled: boolean = true) => {
    const { data, error, isLoading, mutate } = useSWR(
        enabled ? ['users', page, limit] : null,
        usersFetcher,
        {
            keepPreviousData: true
        }
    );

    return {
        users: data?.data || [],
        total: data?.total || 0,
        isLoading,
        isError: error,
        mutate
    };
};

// Global mutate helpers
export const mutateQuestions = () => mutate(key => Array.isArray(key) && key[0] === 'questions');
export const mutateQuizConfigs = () => mutate(key => Array.isArray(key) && key[0] === 'quizConfigs');
export const mutateResults = () => mutate(key => Array.isArray(key) && (key[0] === 'allResults' || key[0] === 'userResults'));
export const mutateUsers = () => mutate(key => Array.isArray(key) && key[0] === 'users');
