
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lwdncxquhuobiecbzekr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3ZG5jeHF1aHVvYmllY2J6ZWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNTQ3MTIsImV4cCI6MjA4NzYzMDcxMn0.a0lQQY01HiKLe2P3yj-2D_NYxk-hggWk-tz3RMNH4ik';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        console.log("=== Debugging Grading Logic ===");
        
        // 1. Fetch a Fill-in-the-blank question that we can test with
        const { data: questions, error } = await supabase
            .from('questions_safe_view') // Use safe view to be safe
            .select('id, type, text')
            .eq('type', 'FILL_IN_THE_BLANK')
            .limit(1);

        if (error || !questions || questions.length === 0) {
            console.log("Could not fetch question.");
            return;
        }

        const q = questions[0];
        console.log("Found Question:", q.id);
        console.log("Text:", q.text.substring(0, 50) + "...");

        // 2. Fetch the corresponding Config (we need a valid config ID to submit)
        // We'll search for a config that includes this question's subject/grade level/etc.
        // Or just pick ANY public config and hope it works (might fail if question not in scope).
        // A safer bet is to use the config ID from the user's screenshot if visible, but we don't have it.
        // Let's try to find a config that matches the question's criteria.
        
        // Actually, for debugging, we can't easily submit a real quiz without being authenticated as a user 
        // who started the quiz.
        
        // Alternative: We can inspect the 'questions' table (if we had access) to see the RAW correct_answer.
        // Since we don't have direct access, we will use a different approach.
        
        // We will create a small SQL function (via migration file) that takes a question ID and a user answer,
        // and returns the grading result directly using the logic we THINK is in place.
        // This allows us to verify if the logic *would* work given the data.
        
        console.log("Cannot directly invoke submit_quiz without auth.");
        console.log("Plan: Create a diagnostic SQL function to test grading logic directly.");

    } catch (e) {
        console.error(e);
    }
}

run();
