# Mermaid diagram（図）

コードブロックの言語に `mermaid` を指定するとGitHubが図として描画する。アーキテクチャ図やフローチャートに便利。

````markdown
```mermaid
flowchart TD
    A[開始] --> B{条件}
    B -->|Yes| C[処理A]
    B -->|No| D[処理B]
    C --> E[終了]
    D --> E
```
````

他にも `sequenceDiagram`、`classDiagram`、`gitGraph`、`erDiagram` などが使える。

## T→Bのスイムレーンチャート

担当者・システムごとの処理を `subgraph` でまとめ、処理の流れを上から下へ示す。以下は申請者と承認者のレーンを分けた例。

````markdown
```mermaid
flowchart TB
    subgraph applicant[申請者]
        A[申請を作成]
        D[結果を確認]
    end
    subgraph approver[承認者]
        B[内容を確認]
        C[承認結果を通知]
    end
    A --> B --> C --> D
```
````

`TB` は上から下への方向指定（`TD` も同義）。レーンをまたぐ接続があると、subgraph内の方向指定は親グラフの方向に従うため、この例では全体を `TB` にする。レーンの配置や幅は自動レイアウトに依存する。

構文の詳細は [Mermaid公式のFlowcharts](https://mermaid.js.org/syntax/flowchart.html) を参照。
