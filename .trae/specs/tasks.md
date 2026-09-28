# 密码管理器服务 - 任务计划 (tasks.md)

> 派生自 spec.md v1.0

## 任务总览

| 任务 ID | 标题 | 优先级 | 依赖 | 对应 AC |
|---------|------|--------|------|--------|
| T1 | 项目基础设施配置（类型定义、工具函数、环境配置 | high | 无 | AC-R11, AC-S4 |
| T2 | 实现加密工具模块（AES-256-GCM + PBKDF2 + 随机生成器） | high | T1 | AC-R7, AC-R8, AC-S2 |
| T3 | 实现存储抽象层（KV Storage Adapter + 内存/Mock 实现 + Cloudflare KV 实现） | high | T1 | AC-R4 |
| T4 | 实现认证模块（API Key 验证、初始化、主密码校验） | high | T2, T3 | AC-R1, AC-R2, AC-R3 |
| T5 | 实现密码条目 CRUD API 路由（含软删除、搜索、分页） | high | T3, T4 | AC-R4, AC-R5, AC-R6, AC-R9 |
| T6 | 实现分类/标签 API 路由 | medium | T3, T4 | - |
| T7 | 实现同步/导入导出 API 路由 | medium | T3, T4 | AC-R10 |
| T8 | 实现密码生成器/强度评估 API | low | T1 | - |
| T9 | 实现 proxy.ts 全局认证代理（CORS、API Key 预处理） | high | T4 | AC-R2, AC-R3, AC-R16 |
| T10 | 实现 Next.js 页面：登录/解锁页 | high | T4 | AC-R13 |
| T11 | 实现 Next.js 页面：Dashboard 布局 + 密码列表 + 搜索过滤 | high | T5, T10 | AC-R14, AC-S5 |
| T12 | 实现 Next.js 页面：密码条目创建/编辑/详情表单 | high | T5, T11 | AC-R14 |
| T13 | 实现 Next.js 页面：分类/标签管理 | medium | T6, T11 | - |
| T14 | 实现 Next.js 页面：设置页（API Key 管理、主密码修改、导入导出） | medium | T7, T11 | - |
| T15 | 实现 API 文档页面（OpenAPI/Swagger） | medium | T5, T6, T7, T8 | AC-R15 |
| T16 | 配置 Cloudflare Workers 部署（wrangler.toml + 构建脚本） | high | T1 | AC-R11, AC-S4, AC-R12 |
| T17 | 构建验证与修复（npm run build 无错误） | high | 全部 | AC-R12 |

---

## 详细任务

### Task 1: 项目基础设施配置
- **Status**: pending
- **Priority**: high
- **对应 AC**: AC-R11, AC-S4

#### 工作内容
1. 创建 `lib/types/index.ts`：定义所有核心 TypeScript 类型
   - `PasswordEntry`（id, site, url, username, encryptedPassword, encryptedNotes, tags, categoryId, createdAt, updatedAt, version, trashed, trashedAt）
   - `Category`（id, name, createdAt, updatedAt）
   - `Tag`（id, name, color, createdAt）
   - `ApiKey`（id, keyHash, name, createdAt, lastUsedAt, revoked）
   - `AppConfig`（initialized, masterPasswordHash, salt, kekSalt, createdAt）
2. 创建 `lib/utils/response.ts`：统一的 API 响应格式化工具（success/error 包装）
3. 创建 `lib/utils/validation.ts`：请求体验证工具（Zod 或手写校验）
4. 创建 `lib/errors/index.ts`：自定义错误类（AuthenticationError, ValidationError, NotFoundError, ConflictError 等）和错误处理中间件函数
5. 创建 `.env.example`：环境变量模板
6. 修改 `tsconfig.json` 必要路径别名（如需要）
7. 安装必要依赖：`zod`（验证）、`nanoid`（ID 生成）

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T1-TR1 | rule | `lib/types/index.ts` 包含上述 5 个核心接口/类型定义且可被其他模块 import |
| T1-TR2 | rule | `formatSuccess / formatError 函数可正常使用且返回标准 JSON 结构 |
| T1-TR3 | rule | `.env.example` 列出所有需要的环境变量名及说明 |
| T1-TR4 | rubric | **依赖选型合理性：0=冗余依赖过多；1=合理但缺少数个；2=精简且覆盖所需 | 阈值 ≥1 |

#### 产出文件
- `lib/types/index.ts`
- `lib/utils/response.ts`
- `lib/utils/validation.ts`
- `lib/errors/index.ts`
- `.env.example`
- 更新 `package.json`（新增依赖）

---

### Task 2: 实现加密工具模块
- **Status**: pending
- **Priority**: high
- **依赖**: T1
- **对应 AC**: AC-R7, AC-R8, AC-S2

#### 工作内容
1. 创建 `lib/crypto/ciphers.ts`
   - `encryptAESGCM(key: CryptoKey, plaintext: string): Promise<{ iv: string; ciphertext: string; tag: string }>`
   - `decryptAESGCM(key: CryptoKey, iv: string, ciphertext: string, tag: string): Promise<string>`
2. 创建 `lib/crypto/keyDerivation.ts`
   - `deriveMasterKey(password: string, salt: string, iterations?: number): Promise<CryptoKey>`
   - `hashAPIKey(apiKey: string): Promise<string>`
   - `generateSalt(): string`
3. 创建 `lib/crypto/generator.ts`
   - `generatePassword(length: number, options: { uppercase, lowercase, numbers, symbols }): string`
   - `evaluatePasswordStrength(password: string): { score: 0-4, label: string, suggestions: string[] }`
4. 创建 `lib/crypto/index.ts`：统一导出加密模块
5. 确保加密模块同时兼容 Web Crypto API（Workers 运行时）

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T2-TR1 | rule | `encryptAESGCM + decryptAESGCM` 对同一明文加解密结果一致 |
| T2-TR2 | rule | 对相同明文 + 相同密钥两次调用 `encryptAESGCM` 结果不同（IV 随机） |
| T2-TR3 | rule | `deriveMasterKey` 相同密码+相同盐值产生相同密钥 |
| T2-TR4 | rule | `generatePassword` 生成的密码满足指定长度和字符集约束 |
| T2-TR5 | rubric | **加密安全性：0=使用弱加密/固定IV/明文泄漏；1=AES-256-GCM 但 PBKDF2 迭代不足；2=全部最佳实践 | 阈值 ≥2 |

#### 产出文件
- `lib/crypto/ciphers.ts`
- `lib/crypto/keyDerivation.ts`
- `lib/crypto/generator.ts`
- `lib/crypto/index.ts`

---

### Task 3: 实现存储抽象层
- **Status**: pending
- **Priority**: high
- **依赖**: T1
- **对应 AC**: AC-R4

#### 工作内容
1. 创建 `lib/storage/types.ts`：定义 `KVStorage` 接口
   ```typescript
   interface KVStorage {
     get<T>(key: string): Promise<T | null>;
     put<T>(key: string, value: T, ttl?: number): Promise<void>;
     delete(key: string): Promise<void>;
     list(prefix: string): Promise<{ keys: string[] }>;
   }
   ```
2. 创建 `lib/storage/memoryKV.ts`：内存实现（用于本地开发/测试）
3. 创建 `lib/storage/cloudflareKV.ts`：Cloudflare KV 实现（从 globalThis 绑定）
4. 创建 `lib/storage/index.ts`：工厂函数 `getStorage()` 根据环境自动选择
5. 创建 `lib/repositories/passwordRepository.ts`：基于 KV 的密码条目仓储封装（CRUD、搜索、列表、同步）
   - Key 设计：`passwords:{apiKeyId}:{entryId}`
   - 索引 Key：`passwords:{apiKeyId}:index`（存储该用户所有 id 列表）
6. 创建 `lib/repositories/categoryRepository.ts`
7. 创建 `lib/repositories/tagRepository.ts`
8. 创建 `lib/repositories/configRepository.ts`（全局配置、API Key 存储）

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T3-TR1 | rule | `MemoryKV` 的 put/get/delete/list 操作正确工作 |
| T3-TR2 | rule | `passwordRepository.create + findById + list + search + update + softDelete + restore + permanentDelete 方法均可用 |
| T3-TR3 | rule | 不同 API Key 用户的数据 Key 前缀隔离（无跨用户数据泄漏） |
| T3-TR4 | rubric | **存储分层：0=KV 操作直接散落在各处；1=仓储层存在但边界模糊；2=接口+实现+仓储三层清晰 | 阈值 ≥1 |

#### 产出文件
- `lib/storage/types.ts`
- `lib/storage/memoryKV.ts`
- `lib/storage/cloudflareKV.ts`
- `lib/storage/index.ts`
- `lib/repositories/passwordRepository.ts`
- `lib/repositories/categoryRepository.ts`
- `lib/repositories/tagRepository.ts`
- `lib/repositories/configRepository.ts`

---

### Task 4: 实现认证模块
- **Status**: pending
- **Priority**: high
- **依赖**: T2, T3
- **对应 AC**: AC-R1, AC-R2, AC-R3

#### 工作内容
1. 创建 `lib/auth/apiKey.ts`
   - `generateAPIKey(): string`（生成 32+ 字节安全随机 API Key）
   - `validateAPIKey(request: Request): Promise<{ valid: boolean; apiKeyId?: string; keyHash?: string }>`
2. 创建 `lib/auth/init.ts`
   - `initializeApp(masterPassword: string): Promise<{ apiKey: string; apiKeyId: string }>`
   - `isInitialized(): Promise<boolean>`
   - `verifyMasterPassword(masterPassword: string): Promise<boolean>`
   - `changeMasterPassword(oldPassword: string, newPassword: string): Promise<void>`（需重新加密所有条目
3. 创建 `app/api/auth/init/route.ts`：POST 初始化接口
4. 创建 `app/api/auth/login/route.ts`：POST 主密码验证接口（返回临时会话 Token，供 Web UI 使用
5. 创建 `app/api/auth/api-keys/route.ts`：GET/POST 列出/创建 API Key
6. 创建 `app/api/auth/api-keys/[id]/route.ts`：DELETE 吊销 API Key，POST 重新生成

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T4-TR1 | rule | 首次调用 `POST /api/auth/init` 成功返回 API Key；再次调用返回 409 Conflict |
| T4-TR2 | rule | 携带有效 `X-API-Key` 时 `validateAPIKey` 返回 valid=true；否则 valid=false |
| T4-TR3 | rule | 主密码哈希 + 盐值存储在配置中，明文密码不存储 |
| T4-TR4 | rule | 更改主密码后所有现存密码条目都以新密钥重新加密 |
| T4-TR5 | rubric | **认证健壮性：0=API Key 明文存储/可绕过；1=基本可用但缺少速率限制；2=哈希存储+错误响应不泄漏 | 阈值 ≥2 |

#### 产出文件
- `lib/auth/apiKey.ts`
- `lib/auth/init.ts`
- `app/api/auth/init/route.ts`
- `app/api/auth/login/route.ts`
- `app/api/auth/api-keys/route.ts`
- `app/api/auth/api-keys/[id]/route.ts`

---

### Task 5: 实现密码条目 CRUD API 路由
- **Status**: pending
- **Priority**: high
- **依赖**: T3, T4
- **对应 AC**: AC-R4, AC-R5, AC-R6, AC-R9, AC-R10

#### 工作内容
1. 创建 `app/api/passwords/route.ts`
   - GET: 列表查询（支持 query: page, perPage, search, categoryId, tag, trashed=true/false）
   - POST: 创建条目
2. 创建 `app/api/passwords/[id]/route.ts`
   - GET: 读取单条（解密后返回）
   - PUT: 更新条目（version ++）
   - DELETE: 软删除
2. 创建 `app/api/passwords/[id]/restore/route.ts`：POST 恢复删除
3. 创建 `app/api/passwords/[id]/permanent/route.ts`：DELETE 永久删除
4. 创建 `app/api/passwords/sync/route.ts`：GET ?since=ISO 增量同步
5. 所有路由内部调用 T4 的认证校验；每条都需要有效的 API Key

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T5-TR1 | rule | 创建后可读取同 ID 返回字段与创建入参字段值匹配（密码解密后） |
| T5-TR2 | rule | 更新操作后 `version` 字段自增 1；`updatedAt` 晚于原时间 |
| T5-TR3 | rule | DELETE 后默认列表不包含；?trashed=true 包含 |
| T5-TR4 | rule | 搜索参数 `?search=xxx` 匹配 site/url/username 字段 |
| T5-TR5 | rule | `/sync?since=时间戳` 仅返回 createdAt 或 updatedAt 或 trashedAt 晚于时间戳的条目 |
| T5-TR6 | rule | PUT 更新时 version 不匹配返回 409 Conflict（乐观锁冲突） |

#### 产出文件
- `app/api/passwords/route.ts`
- `app/api/passwords/[id]/route.ts`
- `app/api/passwords/[id]/restore/route.ts`
- `app/api/passwords/[id]/permanent/route.ts`
- `app/api/passwords/sync/route.ts`

---

### Task 6: 实现分类/标签 API 路由
- **Status**: pending
- **Priority**: medium
- **依赖**: T3, T4

#### 工作内容
1. `app/api/categories/route.ts`（GET 列表, POST 创建）
2. `app/api/categories/[id]/route.ts`（GET, PUT, DELETE）
3. `app/api/tags/route.ts`（GET 列表, POST 创建）
4. `app/api/tags/[id]/route.ts`（GET, PUT, DELETE）

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T6-TR1 | rule | 分类和标签均具备完整 CRUD |
| T6-TR2 | rule | 删除分类时该分类下密码的分类置空（级联） |

#### 产出文件
- `app/api/categories/route.ts`
- `app/api/categories/[id]/route.ts`
- `app/api/tags/route.ts`
- `app/api/tags/[id]/route.ts`

---

### Task 7: 实现同步/导入导出 API
- **Status**: pending
- **Priority**: medium
- **依赖**: T3, T4

#### 工作内容
1. `app/api/data/export/route.ts`：GET 导出所有数据（JSON）
2. `app/api/data/import/route.ts`：POST 批量导入（JSON，冲突处理策略：skip/overwrite/duplicate）

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T7-TR1 | rule | 导出的数据可被重新导入且数据一致 |
| T7-TR2 | rule | 导入时 skip/overwrite/duplicate 三种策略均正常工作 |

#### 产出文件
- `app/api/data/export/route.ts`
- `app/api/data/import/route.ts`

---

### Task 8: 实现密码生成器/强度评估 API
- **Status**: pending
- **Priority**: low
- **依赖**: T1, T2

#### 工作内容
1. `app/api/tools/generate-password/route.ts`：POST 生成密码
2. `app/api/tools/evaluate-password/route.ts`：POST 评估强度

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T8-TR1 | rule | 生成密码 API 返回满足 length/字符集参数 |
| T8-TR2 | rule | 强度评估返回 0-4 分数 |

#### 产出文件
- `app/api/tools/generate-password/route.ts`
- `app/api/tools/evaluate-password/route.ts`

---

### Task 9: 实现 proxy.ts 全局认证代理
- **Status**: pending
- **依赖**: T4
- **Priority**: high
- **对应 AC**: AC-R2, AC-R3, AC-R16

#### 工作内容
1. 创建 `proxy.ts`（注意：Next.js 16 使用 proxy.ts，弃用 middleware.ts）
2. 配置 matcher：匹配 `/api/*` 路径
3. 处理逻辑：
   - 跳过 `/api/auth/init`（未初始化时允许匿名访问）
   - 跳过 `/api/auth/login`（Web 登录接口）
   - 跳过 OPTIONS 预检请求（CORS）
   - 其他 API 请求检查 X-API-Key 或 Cookie（Web 会话）
   - 注入 CORS 响应头（Access-Control-Allow-*）
4. 设置 CORS 允许来源可配置（环境变量）

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T9-TR1 | rule | 无 X-API-Key 时请求非白名单 API 401 |
| T9-TR2 | rule | OPTIONS 请求返回 200 + CORS 头 |
| T9-TR3 | rule | 有效 API Key 请求正常通过 |
| T9-TR4 | rule | 未初始化时 `/api/auth/init` 可访问；初始化后需鉴权 |

#### 产出文件
- `proxy.ts`

---

### Task 10: 实现登录/解锁页
- **Status**: pending
- **Priority**: high
- **依赖**: T4
- **对应 AC**: AC-R13

#### 工作内容
1. 创建 `app/login/page.tsx`
   - 未初始化显示"设置主密码表单（2 次输入确认）
   - 已初始化显示主密码输入表单（解锁）
   - 登录成功后设置 HttpOnly Cookie（会话 Token）
   - 美观 Tailwind CSS 4 样式
2. 创建 `app/actions/auth.ts`：Server Actions（登录、初始化）

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T10-TR1 | rule | 首次访问（未初始化）显示初始化设置主密码表单 |
| T10-TR2 | rule | 设置主密码后跳转到 Dashboard |
| T10-TR3 | rule | 已初始化状态下输入错误密码提示错误且留在登录页 |
| T10-TR4 | rubric | **登录页 UI：0=功能不完整；1=功能可用但粗糙；2=美观且移动端适配 | 阈值 ≥1 |

#### 产出文件
- `app/login/page.tsx`
- `app/actions/auth.ts`

---

### Task 11: 实现 Dashboard 布局与密码列表
- **Status**: pending
- **Priority**: high
- **依赖**: T5, T10
- **对应 AC**: AC-R14, AC-S5

#### 工作内容
1. 创建 `app/dashboard/layout.tsx`：侧边栏（分类、标签、导航 + 顶栏（搜索、设置）
2. 创建 `app/dashboard/page.tsx`：密码列表卡片视图 + 搜索框 + 过滤侧栏
3. 创建 `app/lib/apiClient.ts`：封装 fetch 调用 API（带 Cookie/会话）
4. 列表支持：搜索输入、分类筛选、标签筛选、回收站切换
5. 响应式布局（移动端适配）

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T11-TR1 | rule | 未登录访问 dashboard 自动重定向到 /login |
| T11-TR2 | rule | 列表展示所有密码条目（分页） |
| T11-TR3 | rule | 搜索框输入后列表实时过滤 |
| T11-TR4 | rubric | **Dashboard UI：0=严重 UI 混乱；1=可用但不美观；2=现代美观响应式 | 阈值 ≥1 |

#### 产出文件
- `app/dashboard/layout.tsx`
- `app/dashboard/page.tsx`
- `app/lib/apiClient.ts`

---

### Task 12: 实现密码条目创建/编辑/详情
- **Status**: pending
- **Priority**: high
- **依赖**: T5, T11

#### 工作内容
1. 创建 `app/dashboard/passwords/new/page.tsx`：新建密码表单
2. 创建 `app/dashboard/passwords/[id]/page.tsx`：详情 + 编辑模式切换
3. 创建 `app/dashboard/passwords/[id]/edit/page.tsx`（或使用同一页内 modal）
4. 表单字段：网站名、URL、用户名、密码（生成器按钮）、备注、标签多选、分类下拉
5. 密码显示/隐藏切换、一键复制按钮

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T12-TR1 | rule | 新建密码后返回列表并出现新条目 |
| T12-TR2 | rule | 编辑保存后详情页显示更新后内容 |
| T12-TR3 | rule | 详情页支持删除操作（软删除） |
| T12-TR4 | rule | 密码生成器按钮可插入生成强密码 |

#### 产出文件
- `app/dashboard/passwords/new/page.tsx`
- `app/dashboard/passwords/[id]/page.tsx`

---

### Task 13: 实现分类/标签管理页
- **Status**: pending
- **Priority**: medium
- **依赖**: T6, T11

#### 工作内容
1. `app/dashboard/categories/page.tsx：分类增删改查
2. `app/dashboard/tags/page.tsx`：标签增删改查（含颜色选择）

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T13-TR1 | rule | 分类/标签可新增后可正常工作 |
| T13-TR2 | rule | 删除分类/标签时不关联密码条目不报错（置空） |

#### 产出文件
- `app/dashboard/categories/page.tsx`
- `app/dashboard/tags/page.tsx`

---

### Task 14: 实现设置页面
- **Status**: pending
- **Priority**: medium
- **依赖**: T7, T11

#### 工作内容
1. `app/dashboard/settings/page.tsx`
   - 主密码修改（输入旧密码 + 新密码）
   - API Key 列表 / 吊销 / 新建
   - 导出数据下载按钮
   - 导入数据上传（JSON 文件）
   - 危险区（清空所有数据）

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T14-TR1 | rule | 修改主密码后需重新登录 |
| T14-TR2 | rule | API Key 吊销后使用该 Key 请求返回 401 |
| T14-TR3 | rule | 导出文件下载后可重新导入恢复 |

#### 产出文件
- `app/dashboard/settings/page.tsx`

---

### Task 15: 实现 API 文档页面
- **Status**: pending
- **Priority**: medium
- **依赖**: T5, T6, T7, T8

#### 工作内容
1. 创建 `app/docs/page.tsx`：OpenAPI 规范渲染页面（或使用 swagger-ui-react 之类）
2. 文档列出所有 API：路径、方法、参数、请求体、响应示例
3. 示例 c 示例代码（curl 示例）

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T15-TR1 | rule | 访问 `/docs` 可访问且显示所有接口 |
| T15-TR2 | rule | 每个接口含请求示例和响应格式 |

#### 产出文件
- `app/docs/page.tsx`

---

### Task 16: 配置 Cloudflare Workers 部署
- **Status**: pending
- **Priority**: high
- **依赖**: T1
- **对应 AC**: AC-R11, AC-S4, AC-R12

#### 工作内容
1. 创建 `wrangler.toml`：
   - name、compatibility_date
   - `kv_namespaces` 绑定（2 个：主存储 + 索引）
   - `vars` 环境变量
2. 创建 `adapter-cloudflare/` 或配置 adapterPath 配置（如需要）
3. 创建 `README-部署.md` 说明（或在 `README.md）包含部署步骤）
   - 创建 Worker、创建 KV 命名空间、wrangler 登录、部署命令
4. 修改 `next.config.ts` 配置 adapter（如 adapterPath 或其他 Workers 相关配置）
5. 本地开发模式说明（使用 MemoryKV 无需 Cloudflare 账号）

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T16-TR1 | rule | `wrangler.toml` 存在且定义至少 1 个 KV 命名空间绑定 |
| T16-TR2 | rule | README 部署说明包含所有步骤（创建 KV、绑定、部署） |
| T16-TR3 | rule | 本地 `npm run dev` 启动成功（使用 MemoryKV） |

#### 产出文件
- `wrangler.toml`
- 更新 `next.config.ts`
- 更新 `README.md`

---

### Task 17: 构建验证与修复
- **Status**: pending
- **Priority**: high
- **依赖**: 所有其他任务
- **对应 AC**: AC-R12

#### 工作内容
1. 运行 `npm run build`
2. 修复所有 TypeScript 类型错误
3. 修复所有 ESLint 错误
4. 修复所有构建错误
5. 验证所有页面和 API 路由全部存在且可编译通过

#### 测试要求 (TR)
| TR ID | 类型 | 验证 |
|-------|------|------|
| T17-TR1 | rule | `npm run build` exit code 0 |
| T17-TR2 | rule | `npm run lint` exit code 0（或至少无 error） |
| T17-TR3 | rubric | **代码质量：0=构建通过但 hack/workaround；1=构建通过少量警告；2=干净通过无警告 | 阈值 ≥1 |
