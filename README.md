# Wialon GPS — Claude üçün MCP

Claude-a Wialon GPS hesabınızdakı məlumatları **yalnız oxumaq** üçün çıxış verir. Claude heç nəyi dəyişə, silə və ya maşınlara əmr göndərə bilməz.

İstənilən Wialon serveri ilə işləyir: go.gps.az, gps.fms.az, hst-api.wialon.com və ya öz Wialon serveriniz.

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

## Quraşdırma (Claude Desktop, proqramçı lazım deyil)

1. [Claude Desktop](https://claude.ai/download) proqramını quraşdırın və daxil olun.
2. [wialon-mcp.mcpb](https://github.com/saidmuradkhan/wialon-mcp/releases/latest/download/wialon-mcp.mcpb) faylını yükləyin və iki dəfə klikləyin.
3. **Install** düyməsini basın və formada Wialon saytınızın ünvanını yazın, məsələn `https://gps.fms.az`. Token xanasını boş saxlayın.
4. Claude-a yazın: *"Hazırda hərəkətdə olan maşınlar hansılardır?"*
5. İlk dəfə brauzerdə Wialon giriş səhifəsi açılacaq. İstifadəçi adı və şifrənizlə daxil olub **Authorize** basın, sonra sualı Claude-a təkrar verin.

Bitdi. Giriş yadda qalır, növbəti dəfələr brauzer açılmayacaq.

**Tövsiyə:** Wialon-da yalnız baxış hüququ olan ayrıca istifadəçi yaradın və onunla daxil olun. Claude yalnız o istifadəçinin gördüyü maşınları görəcək.

## Claude Code ilə (proqramçılar üçün)

```bash
npm install
claude mcp add wialon -e WIALON_HOST=https://gps.fms.az -e WIALON_TIMEZONE=Asia/Baku -- node /yol/wialon-mcp/src/index.js
```

Hazır token-iniz varsa, `-e WIALON_TOKEN=...` əlavə edin, o zaman brauzerlə giriş olmayacaq.

## `.mcpb` faylını yenidən yığmaq

```bash
npm install
npx @anthropic-ai/mcpb pack . wialon-mcp.mcpb
```

## Təhlükəsizlik

- Server yalnız oxuma sorğuları göndərir və Wialon-da heç nəyi dəyişmir.
- Şifrəniz yalnız Wialon-un öz səhifəsinə yazılır, Claude onu görmür.
- Girişdən sonra alınan token yalnız sizin kompüterinizdə, istifadəçi qovluğunuzdakı `.wialon-mcp/tokens.json` faylında saxlanılır. Çıxmaq üçün bu faylı silin və ya token-i Wialon-da ləğv edin.
- Məlumat birbaşa sizin kompüterinizdən Wialon serverinə gedir. Arada üçüncü server yoxdur.
- Claude-un gördüyü məlumat sizin Claude hesabınızdakı söhbətə düşür. Buna görə şirkətinizin Claude istifadə qaydalarına əməl edin.
