# language: zh-TW
Feature: Download format
  作為 使用者
  我希望 可以選擇下載音效的格式 (wav / mp3)

  Background:
    Given 使用者已開啟音效編輯工具
    And 有已經編輯完成的節點

  # --------------------------------------------
  # 單一檔案：在節點上打開下載選單並選擇格式
  # --------------------------------------------
  Scenario Outline: 右鍵或下載選單選擇格式後下載單一音檔
    Given 使用者在畫面上看到已編輯完成的音效節點 "<node>"
    When 使用者在該節點上開啟下載選單
    Then 應顯示一個小型格式選單，包含選項 "wav" 與 "mp3"
    When 使用者從格式選單選擇 "<format>"
    And 使用者 確認開始下載
    Then 檔案下載應該開始
    And 下載的檔案名稱以 ".<format>" 為副檔名
    And 下載的檔案 MIME 類型對應於所選格式

    Examples:
      | node   | format |
      | 節點A  | wav    |
      | 節點A  | mp3    |

  # --------------------------------------------
  # 批量下載：先選擇格式，再打包成 zip 下載
  # --------------------------------------------
  Scenario Outline: 批量下載時選擇格式並下載 ZIP 包含所選格式的檔案
    Given 使用者已選取多個音效節點: "<nodes>"
    When 使用者 點擊 "批量下載" 按鈕
    Then 應顯示格式選單，包含選項 "wav" 與 "mp3"
    When 使用者 從格式選單選擇 "<format>"
    And 使用者 確認開始批量下載
    Then 系統應產生一個 ZIP 檔案供下載
    And ZIP 檔案內每個音訊檔案的副檔名皆為 ".<format>"
    And ZIP 檔案包含的檔案數量等於使用者所選節點數量
    And ZIP 檔案的 MIME 類型為 "application/zip"

    Examples:
      | nodes           | format |
      | 節點A, 節點B    | wav    |
      | 節點A, 節點B    | mp3    |

  # Acceptance notes:
  # - 當選擇 mp3 時，下載檔案應為有效的 MP3 檔案 (MIME: audio/mpeg)
  # - 當選擇 wav 時，下載檔案應為有效的 WAV 檔案 (MIME: audio/wav 或 audio/x-wav)
  # - 批量下載時，所有在 ZIP 中的檔案都應已轉換成使用者所選格式
