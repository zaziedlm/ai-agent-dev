/**
 * 確認事項を明示的にやりとりしながら最終回答まで誘導するエージェントの例。
 */

import { Agent, codeInterpreterTool, run, webSearchTool } from '@openai/agents';
import { OpenAI } from 'openai';

process.env.OPENAI_API_KEY ||= '<ここにOpenAIのAPIキーを貼り付けてください>';

const agent = new Agent({
  name: 'Hosted tool researcher',
  instructions: `
あなたは与えられたツールを使って、最新の情報収集・コード実行を行う日本語アシスタントです。
ユーザの依頼に応じて以下の方針を守ってください:
- インターネット上の最新情報が必要な場合は web_search を用いて信頼できる根拠を集める。
- 数値計算やデータ整形が必要な場合は code_interpreter を使ってコードを実行し、実行内容と結果を要約する。
ユーザプロンプトで指定された出力フォーマットとフラグ（needs_info/final）に必ず従ってください。
`.trim(),
  model: 'gpt-5-mini',
  tools: [webSearchTool({ searchContextSize: 'medium' }), codeInterpreterTool()],
});

const client = new OpenAI();
const request = prompt(`調査してほしいテーマやタスクを入力してください:`)?.trim() ?? '';
if (!request) throw new Error('テーマが入力されませんでした。');

const { id: conversationId } = await client.conversations.create({});
console.log('conversationId:', conversationId);

const clarifications: Clarification[] = [];
let isFinalized = false;

for (let turn = 0; turn < 10; turn++) {
  const promptBody = buildPrompt(request, clarifications);
  console.log(`\n[turn ${turn + 1}] agent にリクエストを送信します。`);
  if (clarifications.length > 0) {
    console.log(`  これまでの確認件数: ${clarifications.length}`);
  }
  const response = await run(agent, promptBody, { conversationId, maxTurns: 6 });

  if (response.newItems.length > 0) {
    console.log('\n=== 生成されたアイテム ===\n');
    console.dir(
      response.newItems.map((item) => item.toJSON()),
      { depth: null }
    );
  }

  const parsed = parseAgentReply(response.finalOutput);

  if (parsed?.status === 'needs_info' && parsed.questions?.length) {
    console.log(`\n[turn ${turn + 1}] 追加確認が必要です (${parsed.questions.length} 件)。`);
    parsed.questions.forEach((question, index) => {
      console.log(`  Q${index + 1}: ${question}`);
    });
    const answers = askUserForClarifications(parsed.questions);
    for (let i = 0; i < parsed.questions.length; i++) {
      const question = parsed.questions[i];
      if (!question) continue;
      clarifications.push({
        question,
        answer: answers[i] ?? '',
      });
    }
    continue;
  }

  console.log('\n=== 最終結果 ===\n');
  const printable =
    parsed && parsed.status === 'final'
      ? parsed.answer
      : typeof response.finalOutput === 'string'
        ? response.finalOutput
        : JSON.stringify(response.finalOutput);
  console.log('\n[turn 完了] 最終候補の回答:');
  console.log(printable);

  const additionalInput =
    prompt('追加で修正や質問があれば入力してください。空欄ならこの回答で確定します:')?.trim() ?? '';
  if (additionalInput) {
    console.log('[追加入力] ユーザから追加要望を受け取りました。再実行します。');
    clarifications.push({ question: 'ユーザ追加要望', answer: additionalInput });
    continue;
  }

  isFinalized = true;
  break;
}

if (!isFinalized) {
  console.log('\n=== 最終結果 ===\n');
  console.log('最大試行回数に達しました。ここまでの情報を確認してください。');
}

type Clarification = {
  question: string;
  answer: string;
};

type AgentReply =
  | { status: 'needs_info'; questions: string[] }
  | { status: 'final'; answer: string };

function buildPrompt(originalRequest: string, clarifications: Clarification[]): string {
  const clarificationText =
    clarifications.length === 0
      ? 'まだ追加情報はありません。'
      : clarifications
          .map((item, index) => `Q${index + 1}: ${item.question}\nA${index + 1}: ${item.answer}`)
          .join('\n');

  return `
ユーザの当初依頼:
${originalRequest}

これまでの確認Q&A:
${clarificationText}

これからの指示:
- 追加情報が不足している場合は status=needs_info として、最小限の質問だけを "questions" 配列に入れて JSON で返してください。
- 十分な情報が揃ったら status=final として、最終回答を "answer" に入れて JSON で返してください。
- Clarification log にはユーザが後から追記した要望も含まれるため、参照しつつ最終回答を更新してください。
- 出力は必ず次の JSON 形式のみとし、余計な文字列は含めないでください:
  {"status": "needs_info" | "final", "questions"?: string[], "answer"?: string}
`.trim();
}

function parseAgentReply(finalOutput: unknown): AgentReply | null {
  const normalize = (raw: any): AgentReply | null => {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.status === 'needs_info') {
      const questions = Array.isArray(raw.questions)
        ? raw.questions.filter((q: unknown) => typeof q === 'string' && q.trim().length > 0)
        : [];
      return { status: 'needs_info', questions };
    }
    if (raw.status === 'final') {
      const answer =
        typeof raw.answer === 'string' ? raw.answer : JSON.stringify(raw.answer ?? {});
      return { status: 'final', answer };
    }
    return null;
  };

  if (typeof finalOutput === 'string') {
    try {
      const parsed = JSON.parse(finalOutput);
      const normalized = normalize(parsed);
      if (normalized) return normalized;
    } catch {
      return { status: 'final', answer: finalOutput };
    }
  } else if (finalOutput && typeof finalOutput === 'object') {
    const normalized = normalize(finalOutput);
    if (normalized) return normalized;
  }

  return null;
}

function askUserForClarifications(questions: string[]): string[] {
  const answers: string[] = [];
  for (const question of questions) {
    const reply = prompt(`追加で教えてください:\n${question}`) ?? '';
    answers.push(reply.trim());
  }
  return answers;
}

// 例1: 2025年の日本における再生可能エネルギー投資動向を調べて、主要な統計を計 算し、Markdown形式で表を出力して
