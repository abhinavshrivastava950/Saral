import { beforeAll,describe,it,expect } from "vitest";
import { randomBytes } from "node:crypto";
import { seal,unseal,safeEqual } from "../src/server/crypto";
beforeAll(()=>{process.env.DATA_ENCRYPTION_KEY=randomBytes(32).toString("base64");});
describe("sensitive data envelopes",()=>{
  it("uses fresh nonces and decrypts only with matching record binding",async()=>{const data=Buffer.from("sample salary record");const a=await seal(data,"owner1:record1");const b=await seal(data,"owner1:record1");expect(a).not.toBe(b);expect((await unseal(a,"owner1:record1")).toString()).toBe(data.toString());await expect(unseal(a,"owner2:record1")).rejects.toThrow();});
  it("rejects tampered ciphertext",async()=>{const a=Buffer.from(await seal(Buffer.from("test"),"context"),"base64");a[a.length-1]^=1;await expect(unseal(a.toString("base64"),"context")).rejects.toThrow();});
  it("rejects malformed envelopes and unequal signatures",async()=>{await expect(unseal("bad","context")).rejects.toThrow();expect(safeEqual("abc","abcd")).toBe(false);expect(safeEqual("abc","abc")).toBe(true);});
});
