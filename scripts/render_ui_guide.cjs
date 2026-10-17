const fs = require("node:fs");
const path = require("node:path");
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(__dirname, "../.cache/ms-playwright");
const { chromium } = require("../frontend/node_modules/playwright");

// Local, read-only UI guide capture. Never starts capture/replay or accesses a port.
(async () => {
  const root = path.resolve(__dirname, "..");
  const output = path.join(root, "data/private/ui-guide");
  const base = process.env.CAN_GUIDE_URL ?? "http://127.0.0.1:5173";
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: "light", deviceScaleFactor: 1 });
    async function annotate(entries) {
      await page.evaluate((entries) => {
        document.querySelectorAll(".guide-marker").forEach(el => el.remove());
        for (const [number, selector] of entries) {
          const target = document.querySelector(selector);
          if (!target) throw new Error(`Missing guide section: ${selector}`);
          const rect = target.getBoundingClientRect();
          const badge = document.createElement("span");
          badge.className = "guide-marker";
          badge.textContent = String(number);
          badge.style.cssText = `position:absolute;left:${Math.max(3, rect.left + scrollX - 12)}px;top:${rect.top + scrollY + 3}px;z-index:9999;width:36px;height:36px;display:grid;place-items:center;background:#103e48;color:white;border:3px solid #65e5c4;border-radius:50%;font:700 21px 'Segoe UI';pointer-events:none`;
          document.body.append(badge);
        }
      }, entries);
    }
    await page.goto(`${base}/`);
    await page.getByLabel("Workspace status").waitFor();
    await page.waitForTimeout(500);
    await annotate([[1,".workspace-header"],[2,".workspace-source-card"],[3,".metrics"],[4,".monitor"],[5,".charts-layout"],[6,".decoded-signals"],[7,".recordings"],[8,"footer"]]);
    const raw = await page.screenshot({ fullPage: true });
    await page.goto(`${base}/?view=vehicle`);
    const model = page.getByLabel("Vehicle model", { exact: true });
    await model.waitFor();
    if (await model.inputValue() !== "") throw new Error("Vehicle model must default to empty");
    if (await page.locator(".vt-car").count() !== 0) throw new Error("Model-specific renderer appeared without selection");
    await annotate([[1,".workspace-header"],[2,".workspace-source-card"]]);
    const empty = await page.screenshot({ clip: {x:0,y:0,width:1600,height:460} });
    const option = model.locator('option:not([value=""])').first();
    await option.waitFor({ state: "attached" });
    await model.selectOption(await option.getAttribute("value"));
    await page.getByLabel("Diagnostic data source").selectOption("replay");
    await page.locator(".vt-car").waitFor();
    await page.locator(".vt-module-details > summary").click();
    await page.locator(".vt-provenance > summary").click();
    await page.waitForTimeout(300);
    await annotate([[1,".workspace-header"],[2,".workspace-source-card"],[3,".vt-summary-strip"],[4,".vt-schematic-panel"],[5,".vt-inspector"],[6,".vt-module-details"],[7,".vt-trends"],[8,".vt-provenance"],[9,".vt-bottom-note"]]);
    const selected = await page.screenshot({ fullPage: true });
    const rawNotes = [
      ["标题栏与状态条", "两页共用导航与主题按钮。下方按状态、来源、连接信息、帧数、保存状态、时间戳排列；后端在线不代表已连接车辆。"],
      ["Source 工具栏", "选择 OBDLink 或 Replay。实时模式选择 COM、CAN 速率和串口速率，再 Connect、Start；Stop 停止监听，Disconnect 断开。回放直接下拉选原始帧记录，Load replay 后 Start。刷新均为图标。这里没有车型 Decoder。"],
      ["采集概况", "依次展示每秒帧数、近期活跃 CAN ID、本次连接累计帧数、丢帧/溢出。没有数据源时显示 0。"],
      ["原始 CAN 帧表", "按 ID 搜索、按 11/29-bit 类型筛选并排序。列为 ID/通道、类型、DLC、HEX 载荷、累计数量、Hz、最后接收时间。选行联动字节曲线。"],
      ["字节与活动图", "左侧显示所选 ID 的 Byte 0–7 原始值（0–255）；中间是总线帧数/秒；右侧是各 ID 频率 Hz。它们不等同于电压或车速等物理量。"],
      ["解码与标准 PID", "当前没有被动解码器。Read standard PIDs once 是手动的一次性主动查询，需满足连接和停止采集条件。"],
      ["保存、历史与日志", "填写 Recording name 和备注，Start saving / Stop saving 控制原始帧保存。Recording history 可回放、Export NDJSON；Adapter diagnostics 展示日志。"],
      ["系统统计", "显示串口字节数、解析数量、错误、显示丢帧、ID 淘汰、写入错误和画面刷新率。采集与显示刷新率是不同指标。"],
    ];
    const vehicleNotes = [
      ["通用入口与默认空车型", "打开 Vehicle 时，Vehicle model 默认留空，不恢复历史选择；不显示专属车辆图示、信号和趋势。未选车型点击任一种 Start，弹出先选车型的提示，不发送请求。上方小图展示此默认状态。"],
      ["车型、数据源与操作", "选择车型后才使用对应解码和渲染。目前提供 BYD Dolphin / Japan。Live DID 主动读取固定白名单；Replay 下拉选诊断记录再 Start。记录定义版本必须与车型匹配。Stop、保存、刷新和导出用词及图标与 Raw 一致。"],
      ["四项关键量", "SOC（%）、总电压（V）、电流（A）、计算电功率（kW）。电流保留正负号；功率由顺序电压/电流样本计算，不是机械功率。缺失值为 —。"],
      ["车型专属图示", "选择海豚解码器后，显示电池与动力系统示意图。可以检查电池包和完整分组。物理位置与未验证换算保留候选标识；未映射的转速、扭矩不填充数值。"],
      ["部件详情", "电池包展示温度、候选容量、完整分组数和来源；选中分组则显示电压极值、压差 mV、候选温度 A/B。下方显示所选信号定义。"],
      ["电池分组", "仅显示四项读数完整的候选分组，含电压范围、压差、温度 A/B、时间与来源。不完整或过期的值保持缺失。"],
      ["Signals 与趋势", "最多选择 6 项，曲线和悬停提示均按 Signals 固定顺序显示，不随勾选先后变化。提示含名称、数值、单位。Battery power 名称旁的黄色 CALC 表示计算值。Pause display 仅暂停画面。"],
      ["定义与证据", "展示信号名称、DID 请求或公式、证据类型及验证说明。解码身份与记录定义版本明确匹配，不按相似名称或数值猜测车型。"],
      ["底部状态", "展示读取/回放、历史时间与缓冲状态，可返回 Raw CAN。本说明的截图只进行页面选择，没有开启采集或回放。"],
    ];
    const image = buffer => `<img src="data:image/png;base64,${buffer.toString("base64")}">`;
    const notes = rows => `<div class="notes">${rows.map(([title, text], i) => `<article><b>${i+1}</b><div><h3>${title}</h3><p>${text}</p></div></article>`).join("")}</div>`;
    const date = new Intl.DateTimeFormat("zh-CN", { timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>CAN Observatory 页面说明</title><style>*{box-sizing:border-box}body{max-width:2600px;margin:auto;padding:40px;background:#edf3f6;color:#193442;font-family:'Microsoft YaHei','Segoe UI',sans-serif}h1{font-size:44px;margin:0 0 12px}header p{font-size:24px;line-height:1.6;color:#466171;margin:8px 0}main{display:grid;gap:40px;margin-top:30px}section{background:white;border:1px solid #c7d7df;border-radius:14px;overflow:hidden;display:grid;grid-template-columns:minmax(0,1600px) minmax(0,1fr);align-items:start}h2{grid-column:1/-1;font-size:34px;padding:24px 30px;margin:0;background:#103e48;color:white}img{display:block;width:100%;height:auto}.screens{min-width:0;border-right:1px solid #d0dfe5}.state-caption{padding:14px 24px;font-size:23px;background:#eaf3f5;border-block:1px solid #d0dfe5}.notes{padding:32px;display:grid;gap:30px;min-width:0}article{display:flex;gap:16px;align-items:start}b{flex:none;background:#103e48;color:white;border:3px solid #65e5c4;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;font-size:25px}h3{font-size:28px;margin:0 0 10px;line-height:1.4}article p{font-size:25px;line-height:1.75;margin:0;color:#405967;overflow-wrap:anywhere}footer{font-size:23px;line-height:1.6;margin-top:26px;color:#405967}@media(max-width:1800px){body{padding:24px}section{grid-template-columns:minmax(0,1.5fr) minmax(360px,1fr)}h1{font-size:34px}h2{font-size:28px}.notes{padding:24px;gap:24px}h3{font-size:22px}article p,header p,footer{font-size:19px}b{width:36px;height:36px;font-size:21px}}@media(max-width:900px){body{min-width:1000px}}</style><header><h1>CAN Observatory · 两个页面的区域说明</h1><p>沿用原 Raw CAN 紧凑风格 · 共用状态层级 · Start / Stop · 图标刷新 · 车型默认留空</p><p>${date}（日本时间）· 真实页面截图；圆形编号对应右侧说明。截图内嵌于 HTML，无外部图片依赖。</p></header><main><section><h2>Raw CAN｜原始帧工作台</h2><div class="screens">${image(raw)}</div>${notes(rawNotes)}</section><section><h2>Vehicle｜通用车型解码工作台</h2><div class="screens"><div class="state-caption">默认状态：未选择车型</div>${image(empty)}<div class="state-caption">选择车型后：对应专属渲染与诊断回放入口</div>${image(selected)}</div>${notes(vehicleNotes)}</section></main><footer>本机私人说明文件，不纳入源码提交。Raw 帧与 Vehicle 诊断记录独立；实车数据、设备身份、截图和此 HTML 保留在受 Git 忽略的 data/private/。</footer></html>`;
    const destination = path.join(output, "workspace-guide.html");
    fs.writeFileSync(destination, html);
    console.log(`Updated ${destination}`);
    if(process.argv.includes("--preview")){
      const preview=await browser.newPage({viewport:{width:2600,height:1200},deviceScaleFactor:1});
      await preview.setContent(html,{waitUntil:"load"});
      await preview.screenshot({path:path.join(root,".cache/workspace-guide-preview.png"),fullPage:true});
      const geometry=await preview.evaluate(()=>[...document.querySelectorAll("section")].map(s=>({top:s.getBoundingClientRect().top,bottom:s.getBoundingClientRect().bottom,notes:s.querySelector(".notes").getBoundingClientRect().left,image:s.querySelector(".screens").getBoundingClientRect().right})));
      if(geometry.length!==2 || geometry[1].top<=geometry[0].bottom || geometry.some(g=>Math.abs(g.notes-g.image)>1)) throw new Error("Guide layout validation failed");
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
