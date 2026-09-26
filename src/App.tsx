import './App.css'
import PageLayout from "./components/PageLayout";



function App() {
  return (
    <>
      <main className="app">
        <PageLayout />
      </main>

      <div className='fixed z-100 hidden lg:block'>
        <div className='fixed bottom-6 left-[34px] flex flex-col text-[#fff6d6]/40 text-[.7rem] '>
          <span>技术学习项目 · 仅供学习交流</span>
          <span className='cursor-pointer' onClick={() => window.open("https://github.com/Aero70")}>github: https://github.com/Aero70</span>
          <span className='cursor-pointer' onClick={() => window.open("https://tieba.baidu.com/p/7706766772")}>游戏基底来源: https://tieba.baidu.com/p/7706766772</span>
          <span className='cursor-pointer' onClick={() => window.open("https://github.com/vcmi-mods")}>两个 MOD 均来自 VCMI 兼容 MOD: https://github.com/vcmi-mods</span>
        </div>
      </div>
    </>
  )
}

export default App
