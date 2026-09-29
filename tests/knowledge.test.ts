import {afterEach,beforeEach,expect,test,vi} from "vitest";
import {AppError} from "@/server/errors";

const mocks=vi.hoisted(()=>({geminiKnowledgeNotes:vi.fn(),create:vi.fn()}));
vi.mock("@/server/gemini",()=>({geminiKnowledgeNotes:mocks.geminiKnowledgeNotes,knowledgeFacts:"Trusted sample filing facts."}));
vi.mock("openai",()=>({default:class{responses={create:mocks.create};}}));

import {answerTaxQuestion} from "@/server/knowledge";

const oldKey=process.env.OPENAI_API_KEY;
beforeEach(()=>{process.env.OPENAI_API_KEY="test-only-key";mocks.geminiKnowledgeNotes.mockReset();mocks.create.mockReset();});
afterEach(()=>{if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;vi.restoreAllMocks();});

test("a supporting Gemini outage does not block a bounded tax explanation",async()=>{
  mocks.geminiKnowledgeNotes.mockRejectedValue(new AppError(503,"gemini_network","unavailable"));
  mocks.create.mockResolvedValue({output_text:"We compare both regimes using the saved figures."});
  const warning=vi.spyOn(console,"warn").mockImplementation(()=>{});

  await expect(answerTaxQuestion("Why compare tax regimes?","en")).resolves.toContain("compare both regimes");
  expect(mocks.create).toHaveBeenCalledOnce();
  const request=mocks.create.mock.calls[0][0];
  expect(JSON.parse(request.input)).toMatchObject({trustedFacts:"Trusted sample filing facts.",notes:""});
  expect(warning).toHaveBeenCalledWith("Gemini supporting notes unavailable","gemini_network");
});
