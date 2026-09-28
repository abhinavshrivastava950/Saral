import {beforeEach,describe,expect,it,vi} from "vitest";
import {profileSchema} from "../src/lib/domain";
import {pcmToWav} from "../src/lib/audio";
const state=vi.hoisted(()=>({local:true,save:vi.fn(),profile:vi.fn()}));
vi.mock("@/server/config",()=>({localMode:()=>state.local,env:(name:string)=>process.env[name]}));
vi.mock("@/server/repository",()=>({saveFiling:state.save,getProfile:state.profile,auditEvent:()=>({})}));
import {startDemo,populateDemo,submitDemo,verifyDemo,demoValidationIssues} from "../src/server/demo";
import {viewFiling,confirmChatReview,submitFiling} from "../src/server/filings";
beforeEach(()=>{state.local=true;state.save.mockImplementation(async f=>f);state.profile.mockResolvedValue(profileSchema.parse({}));});
describe("isolated filing simulation",()=>{
  it("complete demo calculates real deterministic amounts and never assigns an official reference",async()=>{const f=populateDemo(await startDemo("owner","complete","test"));const view=await viewFiling(f);expect(view.chatCanReview).toBe(true);expect(view.chatQuestion).toBeNull();expect(view.estimates?.new.estimatedRefund).toBe(22830);expect(f.prefillSource).toBe("unavailable");expect(f.officialReference).toBeNull();expect(f.acknowledgement).toBeNull();});
  it("missing-interest scenario leaves the required value unknown",async()=>{const f=populateDemo(await startDemo("owner","missing-interest","test"));const view=await viewFiling(f);expect(f.salary.depositInterest).toBeNull();expect(view.chatQuestion?.id).toBe("salary.depositInterest");expect(view.chatCanReview).toBe(false);});
  it("requires review before demo submission and submission before verification",async()=>{const f=populateDemo(await startDemo("owner","complete","test"));await expect(submitDemo(f,"bad","test")).rejects.toMatchObject({code:"demo_review_required"});await expect(verifyDemo(f,"test")).rejects.toMatchObject({code:"demo_submission_required"});});
  it("acknowledgement is explicitly simulated and cannot enter the real ERI workflow",async()=>{const f=populateDemo(await startDemo("owner","complete","test")),view=await viewFiling(f);const reviewed=await confirmChatReview(f,view.chatReviewHash,"test");const submitted=await submitDemo(reviewed,reviewed.reviewHash!,"test");const verified=await verifyDemo(submitted,"test");expect(verified.demo?.acknowledgement?.number).toMatch(/^DEMO-ACK-/);expect(verified.demo?.acknowledgement?.simulated).toBe(true);expect(verified.officialReference).toBeNull();expect(verified.acknowledgement).toBeNull();await expect(submitFiling(verified,verified.reviewHash!,"test")).rejects.toMatchObject({code:"demo_cannot_file"});});
  it("does not bypass unsupported loans or uncertain claims in the demo",async()=>{const f=populateDemo(await startDemo("owner","complete","test"));f.declarations.loans=["home"];expect(demoValidationIssues(f).some(x=>x.code==="loan_review")).toBe(true);});
  it("cannot create simulations through production mode",async()=>{state.local=false;await expect(startDemo("owner","complete","test")).rejects.toMatchObject({code:"demo_only"});});
  it("WAV output contains correct byte lengths and rejects corrupt PCM",()=>{const pcm=new Uint8Array([0,0,255,127]),wav=pcmToWav(pcm);expect(new TextDecoder().decode(wav.slice(0,4))).toBe("RIFF");expect(wav.length).toBe(48);expect(new DataView(wav.buffer).getUint32(40,true)).toBe(4);expect(()=>pcmToWav(new Uint8Array(3))).toThrow();});
});
