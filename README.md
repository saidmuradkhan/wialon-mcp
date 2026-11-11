# Wialon GPS — Claude üçün MCP

Claude-a Wialon GPS hesabınızdakı məlumatları **yalnız oxumaq** üçün çıxış verir. Claude heç nəyi dəyişə, silə və ya maşınlara əmr göndərə bilməz.

İstənilən Wialon serveri ilə işləyir: go.gps.az, hst-api.wialon.com və ya öz Wialon serveriniz.

## Claude nəyi görə bilər

| Alət | Nə verir |
|---|---|
| `list_units` | Maşınların indiki vəziyyəti: sürət, son mövqe, son siqnal, xəritə linki. Ad, qrup və "yalnız hərəkətdə olanlar" filtri var |
| `list_groups` | Maşın qrupları və qrupdakı maşınlar |
| `unit_track` | Bir maşının 7 günə qədər marşrutu, təxmini yürüşü və maksimal sürəti |
| `unit_events` | Wialon bildirişlərinin qeydə aldığı hadisələr: kəskin sürətlənmə/əyləc, sürət həddi, geozona giriş/çıxış və s. |
| `unit_sensors` | Maşının sensorlarının indiki dəyərləri: mühərrik, yanacaq, gərginlik və s. |
| `list_reports` | Hesabınızdakı hesabat şablonları |
| `run_report` | İstənilən şablonu maşın və ya qrup üçün işə salır: yürüş, səfərlər, dayanacaqlar, yanacaq, motosaat və s. |
| `list_geofences` | Geozonalar |
| `list_drivers` | Sürücülər və hazırda bağlı olduqları maşın |

Yanacaq, yürüş və səfər rəqəmləri Wialon-dakı **hesabat şablonlarınızdan** gəlir. Şablonda olmayan məlumatı Claude da görməyəcək.

## 1. Wialon token alın

Token Claude-un hesabınıza girmək üçün istifadə etdiyi açardır.

1. Brauzerdə bu ünvanı açın (başqa serverdirsə, `gps.fms.az` hissəsini dəyişin):
   `https://gps.fms.az/login.html?client_id=wialon-mcp&access_type=-1&activation_time=0&duration=0&flags=0x1`
2. Wialon istifadəçi adı və şifrənizlə daxil olun və icazə verin.
3. Ünvan sətrində `access_token=` sözündən sonra gələn uzun kodu kopyalayın. Bu sizin token-inizdir.

**Tövsiyə:** Wialon-da yalnız baxış hüququ olan ayrıca istifadəçi yaradın və token-i həmin istifadəçi ilə alın. Claude yalnız o istifadəçinin gördüyü maşınları görəcək.

Token-i heç kimə göndərməyin. Onu Wialon-da istənilən vaxt ləğv edə bilərsiniz.

## 2. Claude Desktop-a quraşdırın 

1. [Claude Desktop](https://claude.ai/download) proqramını quraşdırın və daxil olun.
2. `wialon-mcp.mcpb` faylını iki dəfə klikləyin. Claude Desktop açılacaq və quraşdırmanı təklif edəcək.
3. **Install** düyməsini basın və formanı doldurun:
   - **Wialon server:** `https://gps.fms.az` (başqa serverdirsə, onun ünvanı)
   - **Wialon token:** 1-ci addımda kopyaladığınız kod
   - **Time zone:** `Asia/Baku`
4. Bitdi. Claude-a yazın: *"Hazırda hərəkətdə olan maşınlar hansılardır?"*

Bu yolla quraşdırma hər kompüterdə ayrıca edilir. Hər işçi öz token-ini istifadə edə bilər.

## Claude Code ilə (proqramçılar üçün)

```bash
npm install
claude mcp add wialon -e WIALON_HOST=https://gps.fms.az -e WIALON_TOKEN=TOKEN -e WIALON_TIMEZONE=Asia/Baku -- node /yol/wialon-mcp/src/index.js
```

## `.mcpb` faylını yenidən yığmaq

```bash
npm install
npx @anthropic-ai/mcpb pack . wialon-mcp.mcpb
```

## Təhlükəsizlik

- Server yalnız oxuma sorğuları göndərir və Wialon-da heç nəyi dəyişmir.
- Token yalnız sizin kompüterinizdə, Claude Desktop-un ayarlarında saxlanılır. Kodda və faylda heç bir token yoxdur.
- Məlumat birbaşa sizin kompüterinizdən Wialon serverinə gedir. Arada üçüncü server yoxdur.
- Claude-un gördüyü məlumat sizin Claude hesabınızdakı söhbətə düşür. Buna görə şirkətinizin Claude istifadə qaydalarına əməl edin.
