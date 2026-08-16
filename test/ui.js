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
    featureKind: '研修制度', featureDetail: '若手でも挑戦できるから',
    cardWhere: '職場見学',
    cardWhat: '社員の方が、作業を始める前に必ずおたがいに声をかけ合っていた',
    cardFeel: ['おどろいた', '見習いたい'],
    cardLink: 'アルバイトで、声をかけ合うとミスが減ったことがある',
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
    featureKind: 'ゼミ', featureDetail: '自治体と組んで課題を調べられるから',
    cardWhere: '体験授業',
    cardWhat: '学生同士が、答えではなく考え方のほうを話し合っていた',
    cardFeel: ['わくわくした', '自分もやってみたい'],
    cardLink: '課題研究で、人と話すほど自分の考えが整理された',
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
  // 答えた設問はたたまれる。生徒と同じように、押して開いてから触る
  const open = async (id) => {
    const folded = page.locator('.fieldDone[data-field="' + id + '"]');
    if (await folded.count()) { await folded.click(); await page.waitForTimeout(250); }
  };
  const fillIf = async (sel, val) => {
    await open(sel.replace('#f_', ''));
    if (await page.locator(sel).count()) await page.fill(sel, val);
  };
  const clickIf = async (sel) => {
    const m = sel.match(/data-field="([^"]+)"/);
    if (m) await open(m[1]);
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
  await open('targetChars');
  console.log('  目標字数（STEP1の選択が入っているか）:', await page.inputValue('#f_targetChars'));
  console.log('  学年・クラス・出席番号:',
    (await page.locator('#f_grade option').count()) - 1, '/',
    (await page.locator('#f_classGroup option').count()) - 1, '/',
    (await page.locator('#f_seatNo option').count()) - 1, '通り');
  await page.selectOption('#f_grade', '3年');
  await page.selectOption('#f_classGroup', '2組');
  await page.selectOption('#f_seatNo', '15番');

  await fillIf('#f_studentName', '山田太郎');
  await fillIf('#f_highSchool', '〇〇県立△△高等学校');
  await fillIf('#f_targetName', d.basic.targetName);
  await fillIf('#f_targetSub', d.basic.targetSub);
  await step();

  // ── STEP 3：調べる ─────────────────────────────
  console.log('STEP3:', await page.textContent('#stepLabel'));
  console.log('  並び:',
    (await page.locator('.field, .fieldDone').evaluateAll(e => e.map(x => x.dataset.field))).join(' → '));
  console.log('  Q1:', (await page.textContent('[data-field="featureKind"] .field__q')).trim());
  console.log('  Q2:', (await page.textContent('[data-field="featureName"] .field__q')).trim());
  // 種類を選び直すと、次の設問の文面と例が入れ替わる
  await page.selectOption('#f_featureKind', d.featureKind);
  await page.waitForTimeout(450);
  console.log('  「' + d.featureKind + '」に変えると Q2:',
    (await page.textContent('[data-field="featureName"] .field__q')).trim());
  console.log('    例:', (await page.locator('[data-field="featureName"] .field__ex').allTextContents())
    .join(' ').replace(/\s+/g, ' ').trim());
  await fillIf('#f_featureName', d.feature);
  await page.locator('#f_featureName').blur();
  await page.waitForTimeout(400);
  console.log('  Q3:', (await page.textContent('[data-field="featureDetail"] .field__q')).trim());
  console.log('  Q2のプレビュー:',
    (await page.textContent('[data-field="featureName"] .field__previewText')).trim());
  await fillIf('#f_featureDetail', d.featureDetail);
  console.log('  Q4のプレビュー:',
    (await page.textContent('[data-field="featureDetail"] .field__previewText')).trim());
  await fillIf('#' + d.extraId, d.extra);
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

  // ── STEP 5：自分を知る ──────────────────────────
  console.log('STEP5:', await page.textContent('#stepLabel'));

  // 答えた設問はたたまれ、押すと開く（STEP2 に戻って確かめる）
  await page.click('#prevBtn'); await page.waitForTimeout(500);
  console.log('  【たたむ】STEP2 に戻ると たたまれた:', await page.locator('.fieldDone').count(),
    '／開いている:', await page.locator('.field').count());
  console.log('    1行の中身:',
    (await page.locator('.fieldDone').first().textContent()).replace(/\s+/g, ' ').trim());
  const foldedId = await page.locator('.fieldDone').first().getAttribute('data-field');
  await page.click('.fieldDone >> nth=0'); await page.waitForTimeout(400);
  console.log('    押すと開く:', await page.locator('.field[data-field="' + foldedId + '"]').count() === 1);
  await page.click('.stepBar__btns button >> nth=0'); await page.waitForTimeout(400);
  console.log('    「答えた質問も表示」→ たたまれた:', await page.locator('.fieldDone').count());
  await page.click('.stepBar__btns button >> nth=0'); await page.waitForTimeout(400);
  await step();

  // 打ち込んだこと：選べるのは1つ。選ぶと、あとの設問がその活動に合わせて変わる
  await page.click('[data-field="efforts"] .chip:has-text("学校行事")');
  await page.waitForTimeout(300);
  console.log('  1つ選んだあと:');
  console.log('    上限の表示:', (await page.textContent('[data-field="efforts"] .chips__meter')).replace(/\s+/g, ' ').trim());
  console.log('    ほかの選択肢が押せなくなった数:',
    await page.locator('[data-field="efforts"] .chip.is-locked').count());
  console.log('    どれかを聞く設問:', (await page.textContent('[data-field="effortWhich"] .field__q')).trim());
  console.log('    例:', (await page.locator('[data-field="effortWhich"] .field__ex').allTextContents()).join(' ').replace(/\s+/g, ' ').trim());
  await fillIf('#f_effortWhich', '文化祭');
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
  await fillIf('#f_effortWhich', '吹奏楽部');
  await page.locator('#f_effortWhich').blur();
  await page.waitForTimeout(350);

  await fillIf('#f_effortHard', '意見がまとまらないこと');
  await fillIf('#f_effortHow', '一人ずつ話を聞くこと');
  await fillIf('#f_effortAction', '混雑する時間帯の動き方のメモ作り');
  await fillIf('#f_effortResult', '新しく入った人への引き継ぎ');
  await fillIf('#f_effortLearned', '手順を共有することの大切さ');
  await fillIf('#f_licenses', '危険物取扱者乙種4類');

  // 得意なこと・性格：1つだけ選び、きっかけと場面を書く
  await page.click('[data-field="strengths"] .chip >> nth=0');
  await page.waitForTimeout(300);
  console.log('  得意なこと・性格:');
  console.log('    得意は', (await page.textContent('[data-field="strengths"] .chips__meter')).replace(/\s+/g, ' ').trim(),
    '／押せなくなった数', await page.locator('[data-field="strengths"] .chip.is-locked').count());
  await page.click('[data-field="personality"] .chip:has-text("責任感が強い")');
  await page.waitForTimeout(300);
  console.log('    性格は', (await page.textContent('[data-field="personality"] .chips__meter')).replace(/\s+/g, ' ').trim(),
    '／押せなくなった数', await page.locator('[data-field="personality"] .chip.is-locked').count());
  console.log('    きっかけ（得意）:', (await page.textContent('[data-field="strengthEpisode"] .field__q')).trim());
  console.log('    場面（得意）　　:', (await page.textContent('[data-field="strengthScene"] .field__q')).trim());
  console.log('    きっかけ（性格）:', (await page.textContent('[data-field="personalityEpisode"] .field__q')).trim());
  console.log('    場面（性格）　　:', (await page.textContent('[data-field="personalityScene"] .field__q')).trim());
  await fillIf('#f_strengthEpisode', key === 'shushoku' ? '部室の道具置き場を整理した' : 'クラスの発表資料をまとめた');
  await fillIf('#f_strengthScene', key === 'shushoku' ? '部品を決まった場所に戻す作業' : 'グループで調べたことをまとめる場面');
  await fillIf('#f_personalityEpisode', '任された係を3年間続けた');
  await fillIf('#f_personalityScene', key === 'shushoku' ? '後輩に手順を教える場面' : '班で意見が分かれたとき');
  await page.waitForTimeout(250);
  console.log('    こう文になります（きっかけ）:',
    (await page.textContent('[data-field="personalityEpisode"] .field__previewText')).trim());
  console.log('    こう文になります（場面）　　:',
    (await page.textContent('[data-field="personalityScene"] .field__previewText')).trim());

  // 選択肢を押す／解除しても、見ていた場所から動かない
  await page.locator('[data-field="personality"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const beforeY = await page.evaluate(() => window.pageYOffset);
  await page.click('[data-field="personality"] .chip.is-on >> nth=0');
  await page.waitForTimeout(450);
  const afterY = await page.evaluate(() => window.pageYOffset);
  await page.click('[data-field="personality"] .chip:has-text("責任感が強い")');
  await page.waitForTimeout(450);
  await fillIf('#f_personalityEpisode', '任された係を3年間続けた');
  await fillIf('#f_personalityScene', key === 'shushoku' ? '後輩に手順を教える場面' : '班で意見が分かれたとき');
  console.log('    解除しても先頭へ飛ばない:', beforeY > 200 && afterY > 200 ? 'OK（' + beforeY + '→' + afterY + '）' : '× ' + beforeY + '→' + afterY);
  console.log('    入力済の表示:', (await page.locator('.field__done').first().textContent()).trim());

  await fillIf('#f_futureDream', 'ものづくり');
  if (await page.locator('#f_futureWhySource').count()) {
    await page.selectOption('#f_futureWhySource', '自分の体験から');
  }
  await fillIf('#f_futureWhyWhat', '先輩が新人に教えている姿');
  await fillIf('#f_gapNow', '自分から動く力');
  await step();

  // ── STEP 6：つなげる ───────────────────────────
  console.log('STEP6:', await page.textContent('#stepLabel'));
  await fillIf('#f_valueFound', '人と話しながら考えを深めること');
  await fillIf('#f_wantObject', d.mainReason);
  const whys = page.locator('.why textarea');
  await whys.nth(0).fill('文化祭の運営で自分たちで決めて動くのが楽しかったから');
  await whys.nth(1).fill('任されたほうが責任を感じて力が出たから');
  await whys.nth(2).fill('自分で考えて動ける環境のほうが力を発揮できると気づいたから');
  await fillIf('#f_mustPoint', '最後まで責任を持つ体制');
  await step();

  // ── STEP 7：その先を書く ───────────────────────
  console.log('STEP7:', await page.textContent('#stepLabel'));
  await page.click('[data-field="afterEnter"] .chip:has-text("' + d.chips.after + '")');
  await fillIf('#f_afterAction', '先輩への質問');
  await fillIf('#f_contribution', d.contribution || '最後までやり切る力');
  await fillIf('#f_afterGradWhat', '後輩に教えられる技術');
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

  // ── 「やり直す」で保存が消えるか ──────────────────
  {
    const page = await browser.newPage();
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    await page.goto('http://127.0.0.1:8765/index.html');
    await page.waitForTimeout(400);
    await page.click('.courseCard:has-text("就職")');
    await page.waitForTimeout(200);
    await page.click('#nextBtn'); await page.waitForTimeout(250);
    const g = page.locator('.picks');
    for (let i = 0; i < 3; i++) { await g.nth(i).locator('.pickCard').nth(0).click(); await page.waitForTimeout(140); }
    await page.click('#nextBtn'); await page.waitForTimeout(250);
    await page.fill('#f_studentName', '山田太郎');
    await page.waitForTimeout(500);
    const read = () => page.evaluate(() => {
      const raw = localStorage.getItem('shibou-douki-v2');
      return raw ? (JSON.parse(raw).data || {}).studentName || '空' : '（保存なし）';
    });
    console.log('\n【やり直す】押す前の保存:', await read());
    await page.click('#resetBtn');
    await page.waitForTimeout(1500);
    console.log('  押したあとの保存:', await read());
    console.log('  画面:', (await page.textContent('#stepLabel')).trim(),
      '／進路:', await page.evaluate(() => document.body.dataset.course || '（未選択）'));
    await page.close();
  }

  console.log('\nエラー:', errors.length ? errors.join('\n') : 'なし');
  await browser.close();
})();
