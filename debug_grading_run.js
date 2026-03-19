
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lwdncxquhuobiecbzekr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3ZG5jeHF1aHVvYmllY2J6ZWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNTQ3MTIsImV4cCI6MjA4NzYzMDcxMn0.a0lQQY01HiKLe2P3yj-2D_NYxk-hggWk-tz3RMNH4ik';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        console.log("=== Running Grading Diagnostic ===");
        
        // 1. Fetch a Fill-in-the-blank question to test
        const { data: questions, error } = await supabase
            .from('questions_safe_view')
            .select('id, type, text')
            .eq('type', 'FILL_IN_THE_BLANK')
            .limit(1);

        if (error || !questions || questions.length === 0) {
            console.log("Could not fetch question.");
            return;
        }

        const q = questions[0];
        console.log("Testing Question:", q.id);
        
        // 2. Define a simulated user answer (matches format sent by frontend)
        // Format: "Answer1;&&;Answer2" or "Answer1"
        // Let's assume the correct answer is "teeth" (from screenshot context)
        // But we don't know the REAL correct answer here, so we will try a few variations 
        // and see what the raw data reveals.
        
        const testAnswer = "teeth"; // Simple test
        
        console.log(`Simulating User Answer: "${testAnswer}"`);

        // 3. Call the debug RPC
        const { data: gradingResult, error: rpcError } = await supabase
            .rpc('debug_grade_question', {
                p_question_id: q.id,
                p_user_answer: testAnswer
            });

        if (rpcError) {
            console.error("RPC Error:", rpcError);
        } else {
            console.log("\n=== Diagnostic Result ===");
            // Handle array response
            const result = Array.isArray(gradingResult) ? gradingResult[0] : gradingResult;
            
            if (result) {
                console.log("Question Type:", result.question_type);
                console.log("Raw DB Answer:", result.raw_correct_answer);
                console.log("Parsed DB Answer:", result.parsed_correct_answer);
                console.log("Parsed User Answer:", result.parsed_user_answer);
                console.log("Is Correct:", result.is_correct);
                
                // Deep analysis
                if (result.is_correct === false) {
                    console.log("\n[ANALYSIS] Grading FAILED.");
                    if (result.raw_correct_answer && result.raw_correct_answer.startsWith('[')) {
                        console.log("DB Answer is JSON Array.");
                        if (result.parsed_correct_answer && result.parsed_correct_answer.length > 0) {
                             console.log("Parsing seems OK:", result.parsed_correct_answer);
                             console.log("Maybe normalization issue? 'normalize_answer' removes spaces/case.");
                        } else {
                             console.log("CRITICAL: Parsing failed! JSON array was not converted to SQL array correctly.");
                        }
                    } else {
                        console.log("DB Answer is NOT JSON Array (Legacy format).");
                    }
                } else {
                    console.log("\n[ANALYSIS] Grading PASSED. Logic seems correct for this case.");
                }
            } else {
                console.log("No result returned. Question ID might be invalid or permissions issue.");
            }
        }

    } catch (e) {
        console.error(e);
    }
}

run();
