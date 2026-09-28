import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({speech:vi.fn(),transcribe:vi.fn()}));
vi.mock("openai",()=>({default:class{audio={speech:{create:mocks.speech},transcriptions:{create:mocks.transcribe}}}}));
import {openaiVoiceReady,speakOpenAI,transcribeOpenAI} from "../src/server/openai-voice";
beforeEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();vi.stubEnv("OPENAI_API_KEY","test-only-key");vi.stubEnv("OPENAI_TTS_MODEL","gpt-4o-mini-tts");vi.stubEnv("OPENAI_TTS_VOICE","marin");vi.stubEnv("OPENAI_TRANSCRIBE_MODEL","gpt-4o-mini-transcribe");});
describe("OpenAI voice boundary",()=>{
  it("uses OpenAI TTS with Hindi guidance and masks sensitive identifiers",async()=>{
    mocks.speech.mockResolvedValue(new Response(new Uint8Array([82,73,70,70]),{headers:{"content-type":"audio/wav"}}));
    const r=await speakOpenAI("नमस्ते, PAN AAPPS1234A और खाता 1234567890", "hi");
    const args=mocks.speech.mock.calls[0][0];expect(args.model).toBe("gpt-4o-mini-tts");expect(args.voice).toBe("marin");expect(args.response_format).toBe("wav");expect(args.instructions).toContain("Hindi");expect(args.input).not.toContain("AAPPS1234A");expect(args.input).not.toContain("1234567890");expect(r.mime).toBe("audio/wav");
  });
  it("preserves Hindi transcription without translating it",async()=>{
    mocks.transcribe.mockResolvedValue({text:"मेरी एफडी का ब्याज अठारह हजार रुपये है।"});
    const text=await transcribeOpenAI(new File(["sample"],"sample.webm",{type:"audio/webm"}),"hi");
    expect(mocks.transcribe.mock.calls[0][0]).toMatchObject({model:"gpt-4o-mini-transcribe",language:"hi",response_format:"json"});expect(text).toContain("अठारह");
  });
  it("detects language automatically only when selected",async()=>{mocks.transcribe.mockResolvedValue({text:"My FD interest is 18000"});await transcribeOpenAI(new File(["sample"],"sample.webm"),"auto");expect(mocks.transcribe.mock.calls[0][0]).not.toHaveProperty("language");});
  it("does not silently fall back to another provider",async()=>{mocks.speech.mockRejectedValue({status:429,message:"provider error with sensitive diagnostic"});await expect(speakOpenAI("test")).rejects.toMatchObject({code:"openai_voice_limit"});expect(mocks.speech).toHaveBeenCalledTimes(1);});
  it("requires the OpenAI key and rejects empty audio/text",async()=>{vi.stubEnv("OPENAI_API_KEY","");expect(openaiVoiceReady()).toBe(false);await expect(speakOpenAI("hello")).rejects.toMatchObject({code:"openai_voice_not_configured"});vi.stubEnv("OPENAI_API_KEY","test-only-key");mocks.transcribe.mockResolvedValue({text:"   "});await expect(transcribeOpenAI(new File(["sample"],"sample.webm"))).rejects.toMatchObject({code:"no_speech"});});
});
