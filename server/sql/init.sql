-- ============================================================
-- JuYi 数据库初始化脚本
-- 用法: mysql -u root -p123456 < server/sql/init.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS juyi
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE juyi;

-- 错题表
CREATE TABLE IF NOT EXISTS error_notes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  subject         VARCHAR(50)   NOT NULL,
  difficulty      TINYINT       NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  question        LONGTEXT      COMMENT '题目，HTML格式含base64图片',
  answer          LONGTEXT      COMMENT '解析，HTML格式含base64图片',
  tags            JSON          COMMENT '标签数组，如 ["真题","易错"]',
  source          VARCHAR(200)  DEFAULT '',
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  review_count    INT           DEFAULT 0,
  last_reviewed_at DATETIME     NULL,

  INDEX idx_subject   (subject),
  INDEX idx_difficulty (difficulty),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;