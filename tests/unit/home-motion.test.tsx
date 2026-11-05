// @vitest-environment jsdom
import React from "react";
import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,render} from "@testing-library/react";
import {HomeMotion} from "../../src/components/home-motion";
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();delete (HTMLElement.prototype as unknown as {animate?:unknown}).animate;});
function setup(reduced=false){
 let callback:IntersectionObserverCallback=()=>{},change:()=>void=()=>{};
 const media={matches:reduced,addEventListener:vi.fn((_:string,fn:()=>void)=>{change=fn;}),removeEventListener:vi.fn()};
 vi.stubGlobal("matchMedia",vi.fn(()=>media));
 const observer={observe:vi.fn(),unobserve:vi.fn(),disconnect:vi.fn()};
 vi.stubGlobal("IntersectionObserver",class{constructor(fn:IntersectionObserverCallback){callback=fn;}observe=observer.observe;unobserve=observer.unobserve;disconnect=observer.disconnect;});
 const animation={cancel:vi.fn(),finished:new Promise(()=>{})};
 const animate=vi.fn(()=>animation);
 Object.defineProperty(HTMLElement.prototype,"animate",{configurable:true,writable:true,value:animate});
 const view=render(<main className="marc-home"><div data-home-reveal="" data-testid="reveal">Visible content</div><HomeMotion/></main>);
 const el=view.getByTestId("reveal");
 return {media,observer,animation,animate,view,enter:()=>act(()=>callback([{isIntersecting:true,target:el,boundingClientRect:el.getBoundingClientRect(),intersectionRect:el.getBoundingClientRect(),intersectionRatio:1,rootBounds:null,time:0}],observer as unknown as IntersectionObserver)),reduce:()=>act(()=>{media.matches=true;change();})};
}
it("reveals a reached surface once and releases observer/animation resources",()=>{
 const s=setup();s.enter();s.enter();expect(s.animate).toHaveBeenCalledOnce();expect(s.observer.unobserve).toHaveBeenCalledOnce();
 s.view.unmount();expect(s.observer.disconnect).toHaveBeenCalled();expect(s.animation.cancel).toHaveBeenCalledOnce();expect(s.media.removeEventListener).toHaveBeenCalled();
});
it("honors reduced motion at load and when preferences change",()=>{
 const reduced=setup(true);reduced.enter();expect(reduced.animate).not.toHaveBeenCalled();reduced.view.unmount();
 const live=setup();live.enter();live.reduce();expect(live.animation.cancel).toHaveBeenCalledOnce();expect(live.observer.disconnect).toHaveBeenCalled();
});
it("keeps content visible if a browser cannot animate it",()=>{
 const s=setup();s.animate.mockImplementation(()=>{throw new Error("Unsupported animation");});expect(()=>s.enter()).not.toThrow();expect(s.view.getByText("Visible content").getAttribute("style")).toBeNull();
});
