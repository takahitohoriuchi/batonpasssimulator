# リレーシミュレーター

4×100m リレーのバトンパスを研究・可視化するためのブラウザベースのシミュレーターです。  
トラック上のランナー、バトン、受け渡しゾーン、位相、ピッチ、ストライドなどを扱いながら、リレーの受け渡し動作を試せるようになっています。

この README は、今後このプロジェクトを手で編集するときに、

- このプロジェクトは何をしているのか
- どのファイルがどんな役割なのか
- 機能を変えたいとき、どのファイルを触ればいいのか

がすぐ分かるように書いています。

## プロジェクト概要

このプロジェクトは大きく分けて 2 つの層でできています。

1. ブラウザ上で動くシミュレーター本体
2. 論文や計測データから代表的なピッチ・ストライド曲線を作るための前処理スクリプト

現在のシミュレーター本体は JavaScript で書かれており、`p5.js` で描画、`lil-gui` で操作します。  
ランナーは位相を持ち、内部では角速度 `omega` を基準に動きます。ピッチやストライドはランナー自身の走行距離に応じて変化するようになっています。

## このプロジェクトで今できること

- トラックとレーンの可視化
- 複数チーム・複数走者の召喚
- 1-2、2-3、3-4、または全走者の表示
- バトン受け渡しゲームモード
- ランナーごとの係数調整
- HUD による位相や受け渡し状態の確認
- 論文ベースのピッチ・ストライド曲線の利用

## 実行の入口

基本の入口は [index.html](/Users/takahitohoriuchi/Desktop/研究/リレー研究/index.html) です。  
ここから [main.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/main.js) が読み込まれ、アプリ全体が立ち上がります。

## ゲームモードの遊び方

ゲームモードでは、自分で P と R の受け渡しを操作します。  
GUI の `Game > Enable Game` を ON にし、`Summon > Teams (A-H)` の `Player Team` で自分が操作したいチームを選びます。

### 基本の流れ

1. `Summon!` でランナーを出す
2. R 操作用キーで R を出走させる
3. `Enter` キーで P が「はい！」と声をかける
4. 条件がそろうと、P は自動で差し出し姿勢に入る
5. R 操作用キーでもう一度入力して、R がバトンをつかむ
6. `Enter` キーでもう一度入力して、P がバトンを手放す

### キー操作

- `Space`
  - 再生 / 一時停止
- `ArrowRight`
  - 1フレーム進める
- `ArrowLeft`
  - 1フレーム戻す
- `R`
  - 今の GUI 設定を保ったまま、レースを最初からやり直す
- `Control` / `Tab`
  - R の出走
  - バトン把持
  - Mac では `Control`
  - Windows では `Tab`
- `Enter`
  - P の声かけ
  - バトン手放し

### ゲーム中に画面で見るとよいもの

- HUD
  - P/R の位相、角速度、ピッチ、ストライド、ゲーム状態が見える
- `はい！`
  - P が声かけした合図
- `待って！`
  - P が今のままだと危ないと判断した合図
- `game: p=... r=... offer=...`
  - いま P と R がどの段階にいるかが分かる

### 成功と失敗

- 成功
  - R が把持し、そのあと P が手放すと成功
- 失敗
  - P が R に追いついてぶつかる
  - R がゾーン終端を越える前に手放しまで完了しない

失敗するとシミュレーションは停止します。  
その状態では、何かキーを押すとリセットされます。`R` キーでのやり直しでも構いません。

### まず試すなら

1. `Player Team` を `D` のままにする
2. `Summon` で `D` と `1-2` だけを有効にする
3. `Summon!` を押す
4. `Space` で動かす
5. ゾーンに近づいたら R 操作用キーで R を出走
6. タイミングを見て `Enter` で「はい！」
7. 受け取れそうになったら R 操作用キー
8. 最後に `Enter`

## ファイル構造

```text
リレー研究/
├── index.html
├── main.js
├── sim.js
├── entities.js
├── track.js
├── gui.js
├── gameController.js
├── controller.js
├── fit_representative_stride_curves.py
├── fit_representative_stride_curves_spline.py
├── table3_mean_curves.csv
├── extended_stride_velocity_table.csv
├── csv/
├── docs/
├── images/
└── others/
```

## 主要ファイルの役割

### シミュレーター本体

| ファイル | 役割 |
|---|---|
| [index.html](/Users/takahitohoriuchi/Desktop/研究/リレー研究/index.html) | ブラウザで最初に開く HTML。`p5.js` と `lil-gui` を読み込み、`main.js` を起動する。 |
| [main.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/main.js) | アプリ全体の起点。`setup` / `draw`、HUD描画、カメラ追従、キー操作の受付を担当。 |
| [sim.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/sim.js) | シミュレーション本体。ランナー生成、1フレーム更新、履歴、巻き戻し、リセット、ゾーン定義などを担当。 |
| [entities.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/entities.js) | `Runner` と `Baton` の定義。ランナーの位相、角速度、ストライド、個人内成分の計算を担当。 |
| [track.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/track.js) | トラック形状の幾何計算と描画。`s` 座標から実際の画面座標への変換を担当。 |
| [gui.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/gui.js) | `lil-gui` の構成。カメラ、再生、ゲーム設定、ランナー係数スライダ、HUD表示切替などを担当。 |
| [gameController.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/gameController.js) | ゲームモードの状態管理。P/R のステージ遷移、声かけ、差し出し、把持、失敗判定などを担当。 |
| [controller.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/controller.js) | 非ゲーム用の自動受け渡しロジックの名残。現状はゲームモードが主なので、重要度は低め。 |

### データ作成・研究補助

| ファイル | 役割 |
|---|---|
| [fit_representative_stride_curves.py](/Users/takahitohoriuchi/Desktop/研究/リレー研究/fit_representative_stride_curves.py) | 100m走データから代表的なピッチ・ストライド曲線を多項式近似する旧スクリプト。 |
| [fit_representative_stride_curves_spline.py](/Users/takahitohoriuchi/Desktop/研究/リレー研究/fit_representative_stride_curves_spline.py) | スプラインで代表曲線を作り、100m以降の拡張も含めて CSV と画像を出力するスクリプト。 |
| [table3_mean_curves.csv](/Users/takahitohoriuchi/Desktop/研究/リレー研究/table3_mean_curves.csv) | 10mごとの平均ピッチ・平均ストライド値。 |
| [extended_stride_velocity_table.csv](/Users/takahitohoriuchi/Desktop/研究/リレー研究/extended_stride_velocity_table.csv) | 100m以降まで拡張したピッチ・ストライド・速度の表。 |

### 資料・補助フォルダ

| パス | 役割 |
|---|---|
| [csv](/Users/takahitohoriuchi/Desktop/研究/リレー研究/csv) | 元データ置き場。 |
| [docs](/Users/takahitohoriuchi/Desktop/研究/リレー研究/docs) | 論文や参考資料。モデルの根拠確認用。 |
| [images](/Users/takahitohoriuchi/Desktop/研究/リレー研究/images) | Python スクリプトで出力したグラフ画像や補助画像。 |
| [others](/Users/takahitohoriuchi/Desktop/研究/リレー研究/others) | いらなくなったファイルを詰め込んでいる場所。基本的には今の本体改修では見なくてよい。 |

## 編集するときの最短ガイド

「こういう変更をしたい」と思ったときに、最初に見るべきファイルをまとめます。

### 1. 画面表示を変えたい

- HUD の文言や表示項目を変えたい
  - [main.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/main.js)
- トラックやランナーの見た目を変えたい
  - [track.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/track.js)
- GUI のボタンやスライダを追加したい
  - [gui.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/gui.js)

### 2. ランナーの動き方を変えたい

- 角速度 `omega`、ピッチ、ストライドの計算式を変えたい
  - [entities.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/entities.js)
- ランナーの「自分が何m走ったか」に応じた変化を変えたい
  - [entities.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/entities.js)
- 1フレームごとの更新順や時間進行を変えたい
  - [sim.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/sim.js)

### 3. バトンパスのルールを変えたい

- 声かけ、差し出し、把持、受け渡しの条件を変えたい
  - [gameController.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/gameController.js)
- 失敗条件や成功条件を変えたい
  - [gameController.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/gameController.js)
- ゾーン位置を変えたい
  - [sim.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/sim.js)

### 4. トラックの仕様を変えたい

- レーン数、レーン幅、半径、直線長を変えたい
  - [track.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/track.js)
- `s` 座標と画面上の位置の対応を変えたい
  - [track.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/track.js)

### 5. データモデルを変えたい

- `Runner` に変数を追加したい
  - [entities.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/entities.js)
- 履歴保存や巻き戻しでその変数も保持したい
  - [sim.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/sim.js)
- GUI からその変数を編集したい
  - [gui.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/gui.js)
- HUD に表示したい
  - [main.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/main.js)

### 6. 論文ベースの曲線を更新したい

- 元データから平均曲線を作り直したい
  - [fit_representative_stride_curves.py](/Users/takahitohoriuchi/Desktop/研究/リレー研究/fit_representative_stride_curves.py)
- スプラインや 100m 以降の拡張を変えたい
  - [fit_representative_stride_curves_spline.py](/Users/takahitohoriuchi/Desktop/研究/リレー研究/fit_representative_stride_curves_spline.py)
- 出力CSVやグラフ画像を確認したい
  - [table3_mean_curves.csv](/Users/takahitohoriuchi/Desktop/研究/リレー研究/table3_mean_curves.csv)
  - [extended_stride_velocity_table.csv](/Users/takahitohoriuchi/Desktop/研究/リレー研究/extended_stride_velocity_table.csv)
  - [images](/Users/takahitohoriuchi/Desktop/研究/リレー研究/images)

## よくある変更と、触る順番

### 例1: HUD に新しい値を出したい

1. その値がどこで計算されるべきかを決める
2. [entities.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/entities.js) または [sim.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/sim.js) に値を持たせる
3. [main.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/main.js) の `drawHUD()` に表示を足す

### 例2: GUI で調整できる項目を増やしたい

1. 実際のデータ本体に変数を追加する
2. 必要なら履歴保存対象にも入れる
3. [gui.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/gui.js) にスライダを追加する

### 例3: 受け渡しタイミングの条件を変えたい

1. [gameController.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/gameController.js) の `canOffer()` や `canGrasp()` を見る
2. 必要なら [entities.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/entities.js) の位相や腕状態の持ち方も変える
3. HUD を見ながら挙動を確認する

### 例4: ランナーごとに別のモデルを入れたい

1. [entities.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/entities.js) の `refreshKinematics()` を確認する
2. 個人内成分、対人間成分、係数のどこに入れるかを決める
3. 追加変数が必要なら `Runner` に持たせる
4. 必要なら [gui.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/gui.js) と [sim.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/sim.js) も更新する

## 現在の設計メモ

### ランナー運動の考え方

現在の内部モデルでは、

- 位相の更新は角速度 `omega` 基準
- ピッチは表示用の概念
- ストライドは毎フレーム再計算される値
- ピッチとストライドは「個人内成分 + 対人間成分」を想定

という設計になっています。

ただし現時点では、

- 個人内成分は実装済み
- 対人間成分は将来拡張用の空枠だけあり、今は 0

という状態です。

### 履歴について

[sim.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/sim.js) では履歴を持っているので、ランナーに新しい変数を追加したときは、保存・復元対象になっているかを必ず確認してください。

## 今後編集するときの注意

- `Runner` に変数を追加しただけでは不十分なことが多いです
  - [entities.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/entities.js)
  - [sim.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/sim.js)
  - [gui.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/gui.js)
  - [main.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/main.js)
  をセットで見ると漏れにくいです。
- 見た目だけ変えたいのに `sim.js` をいじる必要はないことが多いです。まずは [track.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/track.js) と [main.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/main.js) を見てください。
- `others/` は今の本体コードではなく、基本的に参照しなくて大丈夫です。

## 初見で読む順番

初めて全体を追うなら、次の順が分かりやすいです。

1. [README.md](/Users/takahitohoriuchi/Desktop/研究/リレー研究/README.md)
2. [index.html](/Users/takahitohoriuchi/Desktop/研究/リレー研究/index.html)
3. [main.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/main.js)
4. [sim.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/sim.js)
5. [entities.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/entities.js)
6. [gameController.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/gameController.js)
7. [track.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/track.js)
8. [gui.js](/Users/takahitohoriuchi/Desktop/研究/リレー研究/gui.js)

## 一言メモ

このプロジェクトは「研究用の試作コード」と「今後の拡張」がかなり近い距離で混ざっているので、何かを変えるときは、

- 表示の変更か
- シミュレーションルールの変更か
- ランナー内部モデルの変更か
- データ根拠の変更か

をまず切り分けると、触るべきファイルがかなり絞れます。
