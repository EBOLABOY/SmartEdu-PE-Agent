"use client";

import { ArrowUp, Bell, PlusCircle, UserCircle } from "lucide-react";
import React, { useState } from "react";

interface LandingPageProps {
  onStart: (query: string) => void;
}

export default function LandingPage({ onStart }: LandingPageProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) {
      onStart(input);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-white text-neutral-800 flex flex-col antialiased font-sans">
      {/* 顶部导航 */}
      <nav className="w-full border-b border-neutral-100 flex justify-between items-center px-6 py-4 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
            动
          </div>
          <span className="text-xl font-bold tracking-tight text-neutral-800">动屏智创</span>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-neutral-600 hover:bg-neutral-100 transition-colors px-4 py-2 rounded-full border border-neutral-200 text-sm font-medium">
            分享协作
          </button>
          <div className="flex items-center gap-2">
            <button className="text-neutral-500 hover:bg-neutral-100 transition-colors p-2 rounded-full flex items-center justify-center">
              <Bell aria-hidden size={20} strokeWidth={2} />
            </button>
            <button className="text-neutral-500 hover:bg-neutral-100 transition-colors p-2 rounded-full flex items-center justify-center">
              <UserCircle aria-hidden size={24} strokeWidth={2} />
            </button>
          </div>
        </div>
      </nav>

      {/* 核心主区 */}
      <main className="flex-grow flex flex-col items-center justify-center px-4 w-full max-w-4xl mx-auto relative">
        {/* 背景虚化光斑装饰 */}
        <div className="absolute inset-0 -z-10 flex items-center justify-center opacity-40 pointer-events-none">
          <div className="w-full h-full max-w-lg max-h-96 bg-gradient-to-tr from-blue-50 to-blue-100 rounded-full blur-[100px]"></div>
        </div>
        
        <div className="w-full flex flex-col items-center space-y-10">
          <h1 className="text-4xl md:text-[44px] font-bold text-center text-neutral-800 max-w-2xl tracking-tight leading-tight">
            今天你想创作一节怎样的体育课？
          </h1>
          
          {/* 输入主框 */}
          <div className="w-full max-w-3xl relative mt-8">
            <form 
              onSubmit={handleSubmit}
              className="flex items-center bg-white border border-neutral-200 rounded-full px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.1)] focus-within:border-blue-400"
            >
              <button type="button" className="p-2 text-neutral-400 hover:text-blue-600 transition-colors rounded-full shrink-0 flex items-center justify-center">
                <PlusCircle aria-hidden size={24} strokeWidth={2} />
              </button>
              
              <input 
                className="flex-grow bg-transparent border-none focus:ring-0 text-neutral-800 text-lg px-4 outline-none placeholder-neutral-400" 
                placeholder="例如：生成一节三年级篮球运球接力课，带互动倒计时..." 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              
              <button 
                type="submit"
                className={`w-10 h-10 rounded-full transition-colors shrink-0 flex items-center justify-center ${input.trim() ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md' : 'bg-neutral-100 text-neutral-400'}`}
                disabled={!input.trim()}
              >
                <ArrowUp aria-hidden size={20} strokeWidth={2.5} />
              </button>
            </form>
            
            <p className="text-center text-[13px] text-neutral-400 mt-6">
              智能体可能会犯错。请在实际教学前核实关键运动安全信息。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
