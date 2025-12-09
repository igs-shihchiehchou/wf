# language: zh-TW
Feature: 改善 UI 機制
  作為 使用者
  我希望 可以更直覺地操作節點編輯器
  以便 提高工作流程的建立效率

  Background:
    Given 使用者已開啟音訊網頁工具

  # ============================================
  # Scenario 1: 拖放檔案自動建立音效輸入節點
  # ============================================
  Scenario: 拖放單一檔案到空白畫布時自動建立音效輸入節點
    Given 畫布上沒有 "音效輸入" 節點
    When 我將 1 個音訊檔案拖放到畫布上
    Then 應建立一個新的 "音效輸入" 節點
    And 節點應出現在拖放位置
    And 拖放的檔案應被加入到該節點中
    And 節點顯示檔案名稱和波形預覽

  Scenario: 拖放多個檔案到空白畫布時建立音效輸入節點
    Given 畫布上沒有 "音效輸入" 節點
    When 我將 3 個音訊檔案同時拖放到畫布上
    Then 應建立一個新的 "音效輸入" 節點
    And 節點應出現在拖放位置
    And 所有 3 個檔案應被加入到該節點中
    And 節點顯示多檔案預覽列表

  Scenario: 拖放檔案到現有音效輸入節點時新增檔案
    Given 畫布上已有一個 "音效輸入" 節點載入了 2 個檔案
    When 我將 1 個新音訊檔案拖放到該節點上
    Then 新檔案應被加入到該節點
    And 節點應顯示共 3 個檔案
    And 不應建立新的音效輸入節點

  Scenario: 拖放檔案到畫布時已存在音效輸入節點的處理
    Given 畫布上已有一個 "音效輸入" 節點
    And 該節點位於畫布左上角
    When 我將音訊檔案拖放到畫布右下角空白處
    Then 應建立一個新的 "音效輸入" 節點在拖放位置
    And 原有的音效輸入節點不受影響

  Scenario: 拖放非音訊檔案時顯示錯誤提示
    Given 畫布處於就緒狀態
    When 我將一個圖片檔案拖放到畫布上
    Then 不應建立任何節點
    And 顯示提示訊息「僅支援音訊檔案格式」

  # ============================================
  # Scenario 2: 拖曳連結至空白處自動彈出 Context Menu
  # ============================================
  Scenario: 從輸出埠拖曳連結到空白處彈出 Context Menu
    Given 我有一個任一節點 (具有 audio 輸出埠)
    When 我從該節點的輸出埠拖曳出一條連結
    And 我在畫布的空白區域放開滑鼠按鈕
    Then 應在放開位置自動彈出 Context Menu
    And Context Menu 應顯示可連接的節點類型清單

  Scenario: 從 Context Menu 選擇節點並自動建立連線
    Given 我從音效輸入節點拖曳連結到空白處
    And Context Menu 已彈出
    When 我從 Context Menu 中選擇「音量調整」節點
    Then 應在放開位置建立一個音量調整節點
    And 原本的連結應自動連接到新節點的輸入埠
    And 連線成功建立

  Scenario: 按 Escape 鍵取消連結拖曳並關閉 Context Menu
    Given 我從節點輸出埠拖曳連結到空白處
    And Context Menu 已彈出
    When 我按下 Escape 鍵
    Then Context Menu 應關閉
    And 連結拖曳應被取消
    And 不應建立任何新節點

  Scenario: 點擊 Context Menu 外部區域關閉選單
    Given 我從節點輸出埠拖曳連結到空白處
    And Context Menu 已彈出
    When 我點擊 Context Menu 外部的畫布區域
    Then Context Menu 應關閉
    And 連結拖曳應被取消
