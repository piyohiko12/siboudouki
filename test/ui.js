const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const SHOT = '/tmp/claude-0/-home-user-siboudouki/1fe4fe7e-ca6f-596d-851e-37b75bdaf0a0/scratchpad/';

const DATA = {
  shushoku: {
    label: '就職',
    cardText: '就職',
    // 型をえらぶ3問（0始まりの選択肢番号）→ 期待する型
    picks: [0, 0, 1],
    wantTemplate: '場面描写型',
    basic: { targetName: '株式会社〇〇製作所', targetSub: '製造職' },
    chips: { research: '仕事の内容', after: '仕事を早く覚えること' },
    feature: '〇〇部品の精密加工',
    featureDetail: '検査から出荷までの一貫生産',
    cardWhere: '職場見学',
    cardWhat: '社員の方が、作業を始める前に必ずおたがいに声をかけ合っていた',
    cardFeel: ['おどろいた', '見習いたい'],
    cardLink: 'アルバイトで、声をかけ合うとミスが減った経験と重なります',
    extraId: 'f_jobTask',
    extra: '部品の加工と寸法の確認',
    contribution: '手順を崩さずに作業を続ける力',
    mainReason: '正確さを求められるものづくり'
  },
  shingaku: {
    label: '進学',
    cardText: '進学',
    picks: [1, 1, 2],
    wantTemplate: '将来目標型',
    basic: { targetName: '〇〇大学', targetSub: '経済学部経済学科' },
    chips: { research: '学べる内容・カリキュラム', after: '専門分野の勉強' },
    feature: '地域経済フィールドワーク',
    featureDetail: '自治体と組んだ課題調査',
    cardWhere: '体験授業',
    cardWhat: '学生同士が、答えではなく考え方のほうを話し合っていた',
    cardFeel: ['わくわくした', '自分もやってみたい'],
    cardLink: '課題研究で、人と話すほど自分の考えが整理された経験と重なります',
    extraId: 'f_studyWant',
    extra: '地域経済論',
    contribution: null,
    mainReason: '地域の課題を調べる力'
  }
};

async function runMode(browser, key, errors) {
  const d = DATA[key];
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForTimeout(300);

  // 型によって出る設問が変わるので、ある欄だけ埋める
  const fillIf = async (sel, val) => {
    if (await page.locator(sel).count()) await page.fill(sel, val);
  };
  const clickIf = async (sel) => {
    if (await page.locator(sel).count()) await page.click(sel);
  };

  console.log('\n############ ' + d.label + 'モード ############');
  console.log('進路未選択のとき「次へ」は disabled =', await page.isDisabled('#nextBtn'));

  await page.click('.courseCard:has-text("' + d.cardText + '")');
  await page.waitForTimeout(250);
  console.log('選択後の「次へ」 disabled =', await page.isDisabled('#nextBtn'));

  const step = async () => { await page.click('#nextBtn'); await page.waitForTimeout(240); };
  await step();

  // ── STEP 1：文章の型をえらぶ ─────────────────────
  console.log('STEP1:', await page.textContent('#stepLabel'));
  console.log('  質問の数:', await page.locator('.picks').count());
  console.log('  未回答で「次へ」→', await (async () => {
    await page.click('#nextBtn');
    await page.waitForTimeout(200);
    const stayed = (await page.textContent('#stepLabel')).indexOf('型') !== -1;
    const err = (await page.textContent('.field__error')).trim();
    return (stayed ? '進まない' : '進んでしまった') + ' / ' + err;
  })());

  const groups = page.locator('.picks');
  for (let i = 0; i < d.picks.length; i++) {
    await groups.nth(i).locator('.pickCard').nth(d.picks[i]).click();
    await page.waitForTimeout(160);
  }
  console.log('  判定:', (await page.textContent('.notice--tip')).replace(/\s+/g, ' ').trim());
  console.log('  選択中の型:', (await page.textContent('.tplCard.is-on .tplCard__name')).trim(),
    '（期待:', d.wantTemplate + '）');
  console.log('  ' + (await page.textContent('.notice:not(.notice--tip) strong')).trim());
  await page.screenshot({ path: SHOT + 'pick-' + key + '.png', fullPage: true });
  await step();

  // ── STEP 2：基本情報 ────────────────────────────
  console.log('STEP2:', await page.textContent('#stepLabel'));
  console.log('  志望先ラベル:', (await page.textContent('[data-field="targetName"] .field__label')).trim());
  console.log('  目標字数（STEP1の選択が入っているか）:', await page.inputValue('#f_targetChars'));

  await page.fill('#f_studentName', '山田太郎');
  await page.fill('#f_highSchool', '〇〇県立△△高等学校');
  await page.fill('#f_targetName', d.basic.targetName);
  await page.fill('#f_targetSub', d.basic.targetSub);
  await step();

  // ── STEP 3：自分を知る ──────────────────────────
  console.log('STEP3:', await page.textContent('#stepLabel'));

  // 打ち込んだこと：選べるのは1つ。選ぶと、あとの設問がその活動に合わせて変わる
  await page.click('[data-field="efforts"] .chip:has-text("学校行事")');
  await page.waitForTimeout(300);
  console.log('  1つ選んだあと:');
  console.log('    上限の表示:', (await page.textContent('[data-field="efforts"] .chips__meter')).replace(/\s+/g, ' ').trim());
  console.log('    ほかの選択肢が押せなくなった数:',
    await page.locator('[data-field="efforts"] .chip.is-locked').count());
  console.log('    どれかを聞く設問:', (await page.textContent('[data-field="effortWhich"] .field__q')).trim());
  console.log('    例:', (await page.locator('[data-field="effortWhich"] .field__ex').allTextContents()).join(' ').replace(/\s+/g, ' ').trim());
  await page.fill('#f_effortWhich', '文化祭');
  await page.locator('#f_effortWhich').blur();
  await page.waitForTimeout(350);
  console.log('    こう文になります:', (await page.textContent('[data-field="effortWhich"] .field__previewText')).trim());
  console.log('    次の設問の呼び名:', (await page.textContent('[data-field="effortAction"] .field__q')).trim());

  // 選び直すと、聞くことも例も入れ替わる
  await page.click('[data-field="efforts"] .chip.is-on >> nth=0');
  await page.waitForTimeout(350);
  await page.click('[data-field="efforts"] .chip:has-text("資格・検定の取得")');
  await page.waitForTimeout(300);
  console.log('  「資格・検定の取得」に変えると:');
  console.log('    どれかを聞く設問:', (await page.textContent('[data-field="effortWhich"] .field__q')).trim());
  console.log('    役割の設問:', await page.locator('[data-field="effortRole"]').count(), '問');
  console.log('    資格・検定の設問:', await page.locator('[data-field="licenses"]').count(), '問');

  await page.click('[data-field="efforts"] .chip.is-on >> nth=0');
  await page.waitForTimeout(350);
  await page.click('[data-field="efforts"] .chip:has-text("部活動")');
  await page.waitForTimeout(300);
  console.log('  「部活動」に変えると:');
  console.log('    どれかを聞く設問:', (await page.textContent('[data-field="effortWhich"] .field__q')).trim());
  console.log('    役割の設問:', await page.locator('[data-field="effortRole"]').count(), '問');
  await page.fill('#f_effortWhich', '吹奏楽部');
  await page.locator('#f_effortWhich').blur();
  await page.waitForTimeout(350);

  await fillIf('#f_effortHard', '意見がまとまらないこと');
  await fillIf('#f_effortHow', '一人ずつ話を聞くこと');
  await fillIf('#f_effortAction', '混雑する時間帯の動き方のメモ作り');
  await fillIf('#f_effortResult', '新しく入った人への引き継ぎ');
  await fillIf('#f_effortLearned', '手順を共有することの大切さ');
  await fillIf('#f_licenses', '危険物取扱者乙種4類');
  await clickIf('[data-field="personality"] .chip:has-text("責任感が強い")');
  await fillIf('#f_futureDream', 'ものづくり');
  if (await page.locator('#f_futureWhySource').count()) {
    await page.selectOption('#f_futureWhySource', '自分の体験から');
  }
  await fillIf('#f_futureWhyWhat', '先輩が新人に教えている姿');
  await fillIf('#f_gapNow', '自分から動く力');
  await step();

  // ── STEP 4：思い出す（出会いと魅力カード）────────
  console.log('STEP4:', await page.textContent('#stepLabel'));

  await page.selectOption('.attrCard select', d.cardWhere);
  await page.fill('.attrCard textarea >> nth=0', d.cardWhat);
  for (const f of d.cardFeel) await page.click('.attrCard .chip:has-text("' + f + '")');
  await page.fill('.attrCard textarea >> nth=1', d.cardLink);
  await page.click('.attrCard .star >> nth=2');
  await page.waitForTimeout(150);
  console.log('  カードのプレビュー:', (await page.textContent('.attrCard__previewText')).trim());
  console.log('  ★:', (await page.textContent('.stars__label')).trim());
  await page.click('.attrCard__add');
  await page.waitForTimeout(150);
  console.log('  カード枚数:', await page.locator('.attrCard').count());
  await page.fill('.attrCard >> nth=1 >> textarea >> nth=0', 'もう1つ気づいたことがありました');
  await page.waitForTimeout(150);

  await clickIf('[data-field="visited"] .chip >> nth=0');
  await page.click('[data-field="attractPoints"] .chip:has-text("' + d.chips.research + '")');
  await step();

  // ── STEP 5：調べる ─────────────────────────────
  console.log('STEP5:', await page.textContent('#stepLabel'));
  await page.fill('#f_featureName', d.feature);
  await fillIf('#f_featureDetail', d.featureDetail);
  await fillIf('#' + d.extraId, d.extra);
  await step();

  // ── STEP 6：つなげる ───────────────────────────
  console.log('STEP6:', await page.textContent('#stepLabel'));
  await fillIf('#f_valueFound', '人と話しながら考えを深めること');
  await page.fill('#f_wantObject', d.mainReason);
  const whys = page.locator('.why textarea');
  await whys.nth(0).fill('文化祭の運営で自分たちで決めて動くのが楽しかったから');
  await whys.nth(1).fill('任されたほうが責任を感じて力が出たから');
  await whys.nth(2).fill('自分で考えて動ける環境のほうが力を発揮できると気づいたから');
  await page.fill('#f_mustPoint', '最後まで責任を持つ体制');
  await step();

  // ── STEP 7：その先を書く ───────────────────────
  console.log('STEP7:', await page.textContent('#stepLabel'));
  await page.click('[data-field="afterEnter"] .chip:has-text("' + d.chips.after + '")');
  await page.fill('#f_afterAction', '先輩への質問');
  await fillIf('#f_contribution', d.contribution || '最後までやり切る力');
  await page.fill('#f_afterGradWhat', '後輩に教えられる技術');
  await fillIf('#f_contributeTo', '同じ高校の後輩');
  await step();

  // ── STEP 8：組み立てる ─────────────────────────
  console.log('STEP8:', await page.textContent('#stepLabel'));
  await page.waitForTimeout(350);
  console.log('  いまの型:', (await page.textContent('.tplNow')).replace(/\s+/g, ' ').trim());
  console.log('  型の選び直しボタン:', await page.locator('.tplNow .btn').count() === 1);
  console.log('  構成カードはこの画面に出ていない:', await page.locator('.tplCard').count() === 0);
  console.log('\n--- 生成された下書き ---\n' + (await page.inputValue('#bodyInput')));
  console.log('  ' + (await page.textContent('#bodyMeter')).replace(/\s+/g, ' ').trim());
  console.log('  ' + (await page.textContent('#unusedBox')).replace(/\s+/g, ' ').trim().slice(0, 160));
  await step();

  console.log('\nSTEP9:', (await page.textContent('.scoreRow')).replace(/\s+/g, ' ').trim());
  const labels = await page.locator('.check__label').allTextContents();
  console.log('  チェック項目:', labels.join(' / '));
  await step();

  console.log('\nSTEP10:', (await page.textContent('.summary')).replace(/\s+/g, ' ').trim());
  return page;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  await runMode(browser, 'shushoku', errors);
  const page = await runMode(browser, 'shingaku', errors);

  // 型を選び直すと、設問も入れかわるか
  await page.click('#stepTabs .tab:nth-child(2)');
  await page.waitForTimeout(250);
  await page.click('.tplCard:has-text("成長課題型")');
  await page.waitForTimeout(250);
  console.log('\n型を「成長課題型」に変更 →',
    (await page.textContent('.notice--tip')).replace(/\s+/g, ' ').trim());
  await page.click('#stepTabs .tab:nth-child(4)');
  await page.waitForTimeout(250);
  console.log('  STEP3 に「今の自分に足りないこと」が出たか:',
    await page.locator('#f_gapNow').count() === 1);
  console.log('  「将来の夢」は消えたか:', await page.locator('#f_futureDream').count() === 0);

  // 進路を切り替えたときの確認ダイアログ
  page.on('dialog', async dlg => { console.log('\n確認ダイアログ:', dlg.message().slice(0, 40) + '…'); await dlg.accept(); });
  await page.click('#stepTabs .tab:nth-child(1)');
  await page.waitForTimeout(250);
  await page.click('.courseCard:has-text("就職")');
  await page.waitForTimeout(300);
  // 進路を変えると必須が空に戻るので、タブでは先へ行けない（B-3 の検証も兼ねる）
  await page.click('#stepTabs .tab:nth-child(6)');
  await page.waitForTimeout(300);
  console.log('進路を変えたあと、タブで先へ飛ぶと:', (await page.textContent('#stepLabel')).trim(),
    'で止まる');
  await page.selectOption('#f_orgType', '会社（民間企業）');
  // 設問セットが就職用に入れ替わったかは、定義側で確かめる
  const swapped = await page.evaluate(() => {
    const ids = window.QUESTIONS.buildSteps('shushoku', 'gap')
      .reduce((a, s) => a.concat(s.fields.map(f => f.id)), []);
    return { jobTask: ids.indexOf('jobTask') !== -1, studyWant: ids.indexOf('studyWant') !== -1 };
  });
  console.log('  就職用の「仕事の理解」が出るか:', swapped.jobTask,
    '／進学用の「受けたい授業」が消えたか:', !swapped.studyWant);

  await page.click('#stepTabs .tab:nth-child(1)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOT + 'course.png', fullPage: true });

  console.log('\nエラー:', errors.length ? errors.join('\n') : 'なし');
  await browser.close();
})();
