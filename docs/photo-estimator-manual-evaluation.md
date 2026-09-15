# AI Photo Defect Estimator - Manual Evaluation Guide

This document outlines the manual evaluation process for the Gemini 2.5 Flash-based multimodal defect estimator, ensuring continuous quality improvement and reducing false positives/negatives in real-world scenarios.

## Goals
1. Maintain high accuracy in identifying defects from images.
2. Minimize hallucinated repairs or excessive cost estimates.
3. Validate that price book matching gracefully defaults when no services match.
4. Catch false positives (flagging dirt as mold, etc.) before the quote reaches the homeowner.

## Process: The Accuracy Loop

1. **Test Set Accumulation**:
   - Every week, export 20 real job photos that were processed by the AI (prioritizing ones where the estimator triggered large cost variations).
   - Randomly sample 5 control photos with known, verified defects (golden set).

2. **Blind Review**:
   - An experienced contractor (or internal QA) reviews the photos without seeing the AI's estimate.
   - The reviewer notes the expected defects, urgency, and estimated cost ranges.

3. **Diffing and Scoring**:
   - Compare the reviewer's findings with the AI's structured output.
   - Evaluate on three axes:
     - **Defect Recall**: Did it catch the actual damage?
     - **Defect Precision**: Did it hallucinate damage?
     - **Price Book Accuracy**: Did it pick the correct line item from the contractor's price book, or did it make up a realistic industry average when one wasn't available?

4. **Feedback & Prompt Tuning**:
   - If false positives are consistently high (e.g., calling shadows "water damage"), append negative examples or specific instructions to the system prompt in `src/lib/multimodal-defect-estimator.ts`.
   - Re-run the golden set tests (`test/photo-defect-estimator.test.ts` integration suite) to ensure the prompt change didn't cause regressions.

## Handling False Positives in Production
- The UI currently presents the AI estimate as a **Draft** in the modal.
- The contractor MUST explicitly click "Apply Items to Quote" to move them onto the actual QuoteBuilder.
- When they delete or modify an AI-suggested line item in the QuoteBuilder, this should ideally be logged as implicit negative feedback (future work: send telemetry back to improve the model).
