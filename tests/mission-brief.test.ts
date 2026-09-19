import test from "node:test";
import assert from "node:assert/strict";
import {
  missionBriefInputSchema,
  missionBriefModelSchema,
  missionBriefStateSchema,
  resolveMissionBriefState,
} from "../src/lib/mission-brief.ts";

const input = {
  objective: "Crie uma campanha para lançar meu curso de finanças no Instagram.",
  answers: [],
  round: 0,
};

test("brief schemas reject excess questions, rounds and inconsistent states", () => {
  assert.equal(
    missionBriefModelSchema.safeParse({
      ready: false,
      understanding: "O objetivo geral está claro, mas faltam decisões importantes.",
      questions: ["Um?", "Dois?", "Três?", "Quatro?"],
      consolidatedBrief: "",
    }).success,
    false,
  );
  assert.equal(missionBriefInputSchema.safeParse({ ...input, round: 4 }).success, false);
  assert.equal(
    missionBriefStateSchema.safeParse({
      ready: true,
      round: 0,
      understanding: "O objetivo e a entrega esperada estão claros.",
      questions: ["Qual é o público?"],
      consolidatedBrief: "Crie a campanha para o público definido.",
    }).success,
    false,
  );
});

test("Agente Zero asks at most three objective questions while context is missing", () => {
  const state = resolveMissionBriefState(
    {
      ready: false,
      understanding: "Entendi o canal e o produto, mas ainda faltam público e prazo.",
      questions: ["Quem é o público?", "Qual é a data do lançamento?"],
      consolidatedBrief: "",
    },
    input,
  );
  assert.equal(state.ready, false);
  assert.deepEqual(state.questions, ["Quem é o público?", "Qual é a data do lançamento?"]);
  assert.equal(state.consolidatedBrief, null);
});

test("a ready decision returns the consolidated brief used by the mission", () => {
  const state = resolveMissionBriefState(
    {
      ready: true,
      understanding: "A campanha terá três vídeos para jovens adultos e será lançada em outubro.",
      questions: [],
      consolidatedBrief:
        "Crie três vídeos para jovens adultos interessados em finanças. O lançamento será em outubro.",
    },
    input,
  );
  assert.equal(state.ready, true);
  assert.match(state.consolidatedBrief ?? "", /três vídeos/);
  assert.deepEqual(state.questions, []);
});

test("after three answered rounds the state consolidates without asking again", () => {
  const state = resolveMissionBriefState(
    {
      ready: false,
      understanding: "Ainda seria útil saber a identidade visual, mas a missão pode começar.",
      questions: ["Qual cor deve ser usada?"],
      consolidatedBrief: "",
    },
    {
      ...input,
      round: 3,
      answers: [
        { question: "Quem é o público?", answer: "Jovens de 20 a 30 anos." },
        { question: "Qual é o formato?", answer: "Três roteiros de vídeo curto." },
        { question: "Qual é o prazo?", answer: "Até sexta-feira." },
      ],
    },
  );
  assert.equal(state.ready, true);
  assert.deepEqual(state.questions, []);
  assert.match(state.consolidatedBrief ?? "", /Jovens de 20 a 30 anos/);
  assert.match(state.consolidatedBrief ?? "", /premissa/i);
});
