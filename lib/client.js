/**
 * dsh-session-manager — Client half (browser).
 *
 * A hand-written DSH client bundle (the same shape as dsh-fa-rtl): the
 * Host half of dsh-client-modules serves this file over
 * `/plugins/dsh-session-manager/client.js`, the module loader registers
 * the factory below, and the browser Cordis tree materializes it when
 * the Loader row mounts. Plain JavaScript only — no JSX, no TypeScript,
 * no imports; everything beyond the platform baseline (react,
 * @deepseek-ai/dsh-client-ui-primitives) arrives through `require`.
 *
 * What it contributes:
 *   - `sidebar.workspaces.session.menu.item` (order 500): a "Delete…"
 *     row in each Session's "..." menu, after the shipped Copy Session ID
 *     (450). It hides on blank rows, confirms, then asks the Host half's
 *     API to archive + trash the session directory.
 *   - `settings.section` (id `session-manager`, order 25): a management
 *     page listing every workspace and orphan session group with sizes,
 *     per-session and bulk delete, workspace purge, and a trash section
 *     with restore / empty-trash.
 *
 * The two halves talk over the plugin's own authenticated HTTP route
 * (`/session-manager-api/...`, registered by lib/index.js). The fetch is
 * same-origin, so the browser's signed DSH cookie rides it and the Host
 * admits the request exactly like the shipped `/api` bridge.
 */
window.__ModuleLoader__.load({
	id: "dsh-session-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var PACKAGE = "dsh-session-manager";
		var CSS_TAG = "session-manager-base";
		var API = (typeof location !== "undefined" ? location.origin : "") + "/session-manager-api";

		var React = require("react");
		var h = React.createElement;
		var MenuItemButton = null;
		try {
			MenuItemButton = require("@deepseek-ai/dsh-client-ui-primitives").MenuItemButton || null;
		} catch (error) {
			/* ui-primitives is an implicit baseline external; fall back to a plain button. */
		}

		/* ------------------------------------------------------------------ */
		/* Locale                                                              */
		/* ------------------------------------------------------------------ */

		var DICTS = {
			en: {
				menuDelete: "Delete…",
				menuConfirm: "Delete this session permanently?\n\n\u201C{title}\u201D\n\nThe log files are moved to the plugin trash first, so you can restore them from Settings \u2192 Session Manager.",
				menuFailed: "Could not delete this session.",
				pageTitle: "Session Manager",
				pageIntro: "Delete stored session logs that the shipped UI can only archive. Deletions move session directories to the plugin trash under $DSH_HOME/trash/sessions and can be restored from this page.",
				refresh: "Refresh",
				totals: "{sessions} sessions · {bytes} on disk",
				trashTitle: "Trash ({count})",
				trashBytes: "{bytes} reclaimable",
				trashEmpty: "Trash is empty.",
				restore: "Restore",
				emptyTrash: "Empty trash…",
				emptyTrashConfirm: "Permanently delete all {count} trash entries ({bytes})?\nThis cannot be undone.",
				workspacesTitle: "Workspaces",
				orphansTitle: "Other directories (no registered workspace)",
				purgeWorkspace: "Delete workspace data…",
				purgeWorkspaceConfirm: "Delete the workspace registration \u201C{title}\u201D and move ALL of its {count} session logs ({bytes}) to the trash?",
				groupSelectAll: "Select all",
				deleteSelected: "Delete selected ({count})",
				deleteOne: "Delete",
				deleteSelectedConfirm: "Move {count} selected session logs to the trash?",
				confirmWord: "Delete",
				cancel: "Cancel",
				liveBadge: "live",
				notOnDisk: "not on disk",
				unnamed: "(untitled)",
				noCwd: "(no working directory)",
				loading: "Loading…",
				loadFailed: "Could not reach the Session Manager API.",
				retry: "Retry",
				busy: "Working…",
				deleted: "Deleted {count} session(s).",
				restored: "Session restored.",
				emptied: "Trash emptied ({count} entries, {bytes}).",
				nothingSelected: "Select at least one session first.",
				outcome: {
					deleted: "moved to trash",
					"refused-live": "refused: the session is live in this Host",
					refused: "refused",
					missing: "no session directory found on disk",
					error: "error",
				},
				resultLine: "{count} deleted · {refused} refused · {missing} missing",
				hiddenLiveNote: "Live sessions cannot be deleted; stop them first.",
			},
			fa: {
				menuDelete: "حذف…",
				menuConfirm: "این سشن برای همیشه حذف شود؟\n\n«{title}»\n\nفایل‌های لاگ ابتدا به سبد plugin منتقل می‌شوند و از تنظیمات ← Session Manager قابل بازگردانی هستند.",
				menuFailed: "حذف این سشن ممکن نشد.",
				pageTitle: "مدیریت سشن‌ها",
				pageIntro: "حذف لاگ‌های سشن‌هایی که رابط اصلی فقط امکان Archive دارد. حذف‌ها پوشه‌ی سشن را به $DSH_HOME/trash/sessions منتقل می‌کنند و از همین صفحه قابل بازگردانی‌اند.",
				refresh: "به‌روزرسانی",
				totals: "{sessions} سشن · {bytes} روی دیسک",
				trashTitle: "سبد ({count})",
				trashBytes: "{bytes} قابل آزادسازی",
				trashEmpty: "سبد خالی است.",
				restore: "بازگردانی",
				emptyTrash: "خالی‌کردن سبد…",
				emptyTrashConfirm: "هر {count} مورد سبد ({bytes}) برای همیشه حذف شود؟\nاین کار برگشت ندارد.",
				workspacesTitle: "پروژه‌ها",
				orphansTitle: "سایر مسیرها (بدون پروژه‌ی ثبت‌شده)",
				purgeWorkspace: "حذف داده‌های پروژه…",
				purgeWorkspaceConfirm: "ثبتِ پروژه‌ی «{title}» و همه‌ی {count} لاگ سشن آن ({bytes}) به سبد منتقل شود؟",
				groupSelectAll: "انتخاب همه",
				deleteSelected: "حذف انتخاب‌شده‌ها ({count})",
				deleteOne: "حذف",
				deleteSelectedConfirm: "{count} لاگ انتخاب‌شده به سبد منتقل شود؟",
				confirmWord: "حذف",
				cancel: "انصراف",
				liveBadge: "فعال",
				notOnDisk: "روی دیسک نیست",
				unnamed: "(بی‌عنوان)",
				noCwd: "(بدون مسیر)",
				loading: "در حال بارگذاری…",
				loadFailed: "اتصال به API مدیر سشن ممکن نشد.",
				retry: "تلاش دوباره",
				busy: "در حال کار…",
				deleted: "{count} سشن حذف شد.",
				restored: "سشن بازگردانی شد.",
				emptied: "سبد خالی شد ({count} مورد، {bytes}).",
				nothingSelected: "ابتدا حداقل یک سشن را انتخاب کنید.",
				outcome: {
					deleted: "به سبد منتقل شد",
					"refused-live": "رد شد: سشن در این Host فعال است",
					refused: "رد شد",
					missing: "پوشه‌ای روی دیسک پیدا نشد",
					error: "خطا",
				},
				resultLine: "{count} حذف · {refused} رد شده · {missing} مفقود",
				hiddenLiveNote: "سشن‌های فعال قابل حذف نیستند؛ اول آن‌ها را متوقف کنید.",
			},
		};

		function makeT(ctx) {
			var ui = "";
			try {
				var service = ctx.get("locale");
				var snapshot = service === undefined ? undefined
					: typeof service.getLocale === "function" ? service.getLocale()
					: typeof service.getSnapshot === "function" ? service.getSnapshot()
					: undefined;
				ui = String((snapshot && (snapshot.locale ?? snapshot.id ?? snapshot.active)) ?? "");
			} catch (error) { /* locale service is optional */ }
			var nav = "";
			try {
				nav = String((typeof navigator !== "undefined" && navigator.language) || "");
			} catch (error) { /* navigator is optional in odd realms */ }
			var lang = "en";
			if (ui.slice(0, 2).toLowerCase() === "fa") lang = "fa";
			else if (nav.slice(0, 2).toLowerCase() === "fa") lang = "fa";
			var dict = DICTS[lang] || DICTS.en;
			return function t(key, params) {
				var text = dict[key] ?? DICTS.en[key] ?? key;
				if (params !== undefined && params !== null) {
					for (var name in params) {
						text = text.split("{" + name + "}").join(String(params[name]));
					}
				}
				return text;
			};
		}

		/* ------------------------------------------------------------------ */
		/* Helpers                                                             */
		/* ------------------------------------------------------------------ */

		function call(path, body, method) {
			var init = {
				method: method || (body === undefined ? "GET" : "POST"),
				headers: {},
			};
			if (body !== undefined) {
				init.headers["content-type"] = "application/json";
				init.body = JSON.stringify(body);
			}
			return fetch(API + path, init).then(async function (response) {
				var data = null;
				try {
					data = await response.json();
				} catch (error) { /* non-JSON failure bodies fall through */ }
				if (!response.ok) {
					var detail = data && (data.message || data.error);
					throw new Error(String(detail || "HTTP " + response.status));
				}
				return data;
			});
		}

		function fmtBytes(bytes) {
			var value = Number(bytes) || 0;
			if (value < 1024) return value + " B";
			var units = ["KB", "MB", "GB", "TB"];
			for (var index = 0; index < units.length; index++) {
				value = value / 1024;
				if (value < 1024 || index === units.length - 1) {
					return (value >= 100 ? Math.round(value) : Math.round(value * 10) / 10) + " " + units[index];
				}
			}
			return value + " TB";
		}

		function fmtDate(ms) {
			if (typeof ms !== "number" || ms <= 0) return "—";
			try {
				return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
			} catch (error) {
				return new Date(ms).toISOString();
			}
		}

		function shortId(id) {
			var text = String(id || "");
			return text.length <= 18 ? text : "…" + text.slice(-12);
		}

		function confirmDialog(message) {
			return typeof window !== "undefined" ? window.confirm(message) : false;
		}

		function alertBox(message) {
			if (typeof window !== "undefined" && typeof window.alert === "function") window.alert(message);
			else console.error("[" + PACKAGE + "] " + message);
		}

		/* ------------------------------------------------------------------ */
		/* Styles                                                              */
		/* ------------------------------------------------------------------ */

		var CSS = [
			".dshm-page{display:flex;flex-direction:column;gap:14px;max-width:860px;}",
			".dshm-page h2{margin:0;font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary);}",
			".dshm-intro{margin:0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);}",
			".dshm-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}",
			".dshm-totals{font-size:12.5px;color:var(--dsw-alias-label-secondary);}",
			".dshm-note{font-size:12.5px;color:var(--dsw-alias-state-success-primary);white-space:pre-wrap;}",
			".dshm-note.is-error{color:var(--dsw-alias-state-error-primary);}",
			".dshm-problems{margin:0;padding:8px 12px;font-size:12px;line-height:1.6;border-radius:8px;",
			"  background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);",
			"  color:var(--dsw-alias-state-warn-primary);}",
			".dshm-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;}",
			".dshm-card+.dshm-card{margin-top:12px;}",
			".dshm-card-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:8px;}",
			".dshm-card-title{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary);}",
			".dshm-card-path{font-size:11.5px;color:var(--dsw-alias-label-secondary);word-break:break-all;}",
			".dshm-card-meta{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-left:auto;}",
			".dshm-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);",
			"  border-radius:7px;padding:4px 10px;font-size:12px;cursor:pointer;line-height:1.6;}",
			".dshm-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}",
			".dshm-btn:disabled{opacity:.45;cursor:not-allowed;}",
			".dshm-btn.danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);}",
			".dshm-btn.danger:hover:not(:disabled){opacity:.8;}",
			".dshm-row{display:flex;align-items:center;gap:10px;padding:7px 4px;border-top:1px solid var(--dsw-alias-border-l1);}",
			".dshm-row:first-of-type{border-top:none;}",
			".dshm-row input[type=checkbox]{accent-color:var(--dsw-alias-brand-primary);margin:0;}",
			".dshm-row-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;}",
			".dshm-row-title{font-size:12.5px;font-weight:500;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".dshm-row-meta{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
			".dshm-badge{font-size:10.5px;padding:1px 7px;border-radius:99px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);flex:none;}",
			".dshm-badge.live{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary);}",
			".dshm-badge.warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary);}",
			".dshm-empty{font-size:12px;color:var(--dsw-alias-label-secondary);padding:4px 2px;}",
			".dshm-error{font-size:12.5px;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;}",
			".dshm-menu-item{all:unset;box-sizing:border-box;display:flex;width:100%;padding:6px 10px;cursor:pointer;",
			"  font-size:12.5px;color:var(--dsw-alias-state-error-primary);}",
			".dshm-menu-item:hover{background:var(--dsw-alias-bg-layer-2);}",
		].join("\n");

		function injectCss() {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]") !== null) return;
			var tag = document.createElement("style");
			tag.dataset.plugin = PACKAGE;
			tag.dataset.pluginCss = CSS_TAG;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		/* ------------------------------------------------------------------ */
		/* Sidebar "..." menu row                                              */
		/* ------------------------------------------------------------------ */

		function DeleteRow(props) {
			var t = props.t;
			var sessionId = props.sessionId;
			var title = props.displayTitle || sessionId;

			// Blank ("New Session") drafts are hidden; only real conversations show the row.
			var retainInfo = undefined;
			if (typeof props.useSessionRetainInfo === "function") {
				try {
					retainInfo = props.useSessionRetainInfo(sessionId);
				} catch (error) { /* showing the row is the safer failure */ }
			}
			var blank = !!(retainInfo && (retainInfo.blank === true || (retainInfo.summary && retainInfo.summary.blank === true)));
			if (blank) return null;

			var menuOpenState = typeof props.useMenuOpenState === "function" ? props.useMenuOpenState() : [null, function () {}];
			var setMenuOpen = typeof menuOpenState[1] === "function" ? menuOpenState[1] : function () {};

			var onDelete = async function () {
				try {
					setMenuOpen(false);
				} catch (error) { /* menu dismissal is best-effort */ }
				if (!confirmDialog(t("menuConfirm", { title: title }))) return;
				try {
					var data = await call("/delete", { sessionIds: [sessionId] });
					var result = data && data.results && data.results[0];
					var outcome = result ? result.outcome : "error";
					if (outcome !== "deleted") {
						var reason = result && result.reason ? "\n" + result.reason : "";
						alertBox(t("menuFailed") + "\n" + (t("outcome." + outcome) || outcome) + reason);
					}
				} catch (error) {
					alertBox(t("menuFailed") + "\n" + String(error.message || error));
				}
			};

			var label = t("menuDelete");
			if (MenuItemButton !== null) {
				return h(MenuItemButton, { separatorBefore: true, onSelect: onDelete }, label);
			}
			return h("button", { type: "button", role: "menuitem", className: "dshm-menu-item", onClick: onDelete }, label);
		}

		/* ------------------------------------------------------------------ */
		/* Settings page                                                       */
		/* ------------------------------------------------------------------ */

		function SessionRow(props) {
			var t = props.t;
			var session = props.session;
			var checked = props.checked;
			var onToggle = props.onToggle;
			var onDelete = props.onDelete;
			var busy = props.busy;

			var id = session.id;
			var name = session.title || t("unnamed");
			var metaBits = [shortId(id)];
			if (typeof session.createdAt === "number") metaBits.push("created " + fmtDate(session.createdAt));
			if (typeof session.updatedAt === "number" && session.updatedAt > 0) metaBits.push("updated " + fmtDate(session.updatedAt));
			if (typeof session.eventCount === "number") metaBits.push(session.eventCount + " events");

			var checkboxes = h("input", {
				type: "checkbox",
				checked: checked,
				disabled: session.live || busy,
				onChange: function () {
					onToggle(id);
				},
			});

			return h(
				"div",
				{ className: "dshm-row" },
				checkboxes,
				h(
					"div",
					{ className: "dshm-row-main" },
					h("div", { className: "dshm-row-title", dir: "auto", title: String(id) }, name),
					h("div", { className: "dshm-row-meta" }, metaBits.join(" · ")),
				),
				session.bytes > 0 ? h("span", { className: "dshm-badge" }, fmtBytes(session.bytes)) : null,
				session.live
					? h("span", { className: "dshm-badge live" }, t("liveBadge"))
					: session.onDisk === false
						? h("span", { className: "dshm-badge warn" }, t("notOnDisk"))
						: null,
				h(
					"button",
					{
						className: "dshm-btn danger",
						disabled: session.live || busy,
						title: session.live ? t("hiddenLiveNote") : undefined,
						onClick: function () {
							onDelete([id]);
						},
					},
					t("deleteOne"),
				),
			);
		}

		function GroupCard(props) {
			var t = props.t;
			var group = props.group;
			var kind = props.kind; // "workspace" | "orphan"
			var selected = props.selected;
			var busy = props.busy;
			var onToggle = props.onToggle;
			var onDeleteSessions = props.onDeleteSessions;
			var onPurge = props.onPurge;

			var deletable = group.sessions.filter(function (session) {
				return !session.live;
			});
			var selectedHere = deletable.filter(function (session) {
				return selected[session.id];
			}).length;

			var headChildren = [
				h("span", { className: "dshm-card-title", dir: "auto" }, group.title || group.path || t("noCwd")),
				h("span", { className: "dshm-card-path", dir: "auto" }, group.path || t("noCwd")),
				h(
					"span",
					{ className: "dshm-card-meta" },
					group.sessions.length + " · " + fmtBytes(group.totalBytes) + (group.liveCount > 0 ? " · " + group.liveCount + " " + t("liveBadge") : ""),
				),
			];
			if (kind === "workspace") {
				headChildren.push(
					h(
						"button",
						{
							className: "dshm-btn danger",
							disabled: busy || group.liveCount > 0 || group.sessions.length === 0,
							title: group.liveCount > 0 ? t("hiddenLiveNote") : undefined,
							onClick: function () {
								onPurge(group);
							},
						},
						t("purgeWorkspace"),
					),
				);
			}
			if (deletable.length > 0) {
				headChildren.push(
					h(
						"button",
						{
							className: "dshm-btn",
							disabled: busy,
							onClick: function () {
								var allSelected = selectedHere === deletable.length;
								deletable.forEach(function (session) {
									onToggle(session.id, !allSelected);
								});
							},
						},
						t("groupSelectAll"),
					),
				);
			}

			var rows = group.sessions.map(function (session) {
				return h(SessionRow, {
					key: session.id,
					t: t,
					session: session,
					checked: !!selected[session.id],
					busy: busy,
					onToggle: function (id) {
						onToggle(id);
					},
					onDelete: onDeleteSessions,
				});
			});

			return h(
				"div",
				{ className: "dshm-card" },
				h("div", { className: "dshm-card-head" }, headChildren),
				group.sessions.length === 0 ? h("div", { className: "dshm-empty" }, "—") : h("div", null, rows),
			);
		}

		function ManagerPage(props) {
			var t = props.t;

			var dataState = React.useState(null);
			var data = dataState[0];
			var setData = dataState[1];

			var errorState = React.useState(null);
			var error = errorState[0];
			var setError = errorState[1];

			var noteState = React.useState(null);
			var note = noteState[0];
			var setNote = noteState[1];

			var busyState = React.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];

			var selectedState = React.useState({});
			var selected = selectedState[0];
			var setSelected = selectedState[1];

			var refresh = React.useCallback(function () {
				setBusy(true);
				setNote(null);
				call("/inventory")
					.then(function (value) {
						setData(value);
						setError(null);
						setSelected({});
					})
					.catch(function (callError) {
						setError(String(callError.message || callError));
					})
					.finally(function () {
						setBusy(false);
					});
			}, []);

			React.useEffect(function () {
				refresh();
			}, [refresh]);

			var toggleOne = function (id, value) {
				setSelected(function (previous) {
					var next = Object.assign({}, previous);
					if (value === undefined) value = !next[id];
					if (value) next[id] = true;
					else delete next[id];
					return next;
				});
			};

			var summarize = function (results, t) {
				var deleted = 0;
				var refused = 0;
				var missing = 0;
				(results || []).forEach(function (result) {
					if (result.outcome === "deleted") deleted += 1;
					else if (result.outcome === "missing") missing += 1;
					else refused += 1;
				});
				return t("resultLine", { count: deleted, refused: refused, missing: missing });
			};

			var deleteSessions = async function (ids) {
				if (!ids || ids.length === 0) {
					setNote({ text: t("nothingSelected"), error: true });
					return;
				}
				if (!confirmDialog(t("deleteSelectedConfirm", { count: ids.length }))) return;
				setBusy(true);
				setNote(null);
				try {
					var value = await call("/delete", { sessionIds: ids });
					setNote({ text: summarize(value.results, t), error: false });
				} catch (callError) {
					setNote({ text: String(callError.message || callError), error: true });
				}
				refresh();
			};

			var purgeWorkspace = async function (group) {
				var message = t("purgeWorkspaceConfirm", {
					title: group.title || group.path,
					count: group.sessions.length,
					bytes: fmtBytes(group.totalBytes),
				});
				if (!confirmDialog(message)) return;
				setBusy(true);
				setNote(null);
				try {
					var value = await call("/delete-workspace", { workspaceId: group.id });
					if (value && value.ok) setNote({ text: summarize(value.results, t), error: false });
					else setNote({ text: t("outcome.refused") + (value && value.error ? ": " + value.error : ""), error: true });
				} catch (callError) {
					setNote({ text: String(callError.message || callError), error: true });
				}
				refresh();
			};

			var restore = async function (entry) {
				setBusy(true);
				setNote(null);
				try {
					await call("/restore", { entry: entry });
					setNote({ text: t("restored"), error: false });
				} catch (callError) {
					setNote({ text: String(callError.message || callError), error: true });
				}
				refresh();
			};

			var emptyTrash = async function () {
				if (!data || !data.trash) return;
				if (!confirmDialog(t("emptyTrashConfirm", { count: data.trash.length, bytes: fmtBytes(data.totals.trashBytes) }))) return;
				setBusy(true);
				setNote(null);
				try {
					var value = await call("/empty-trash", {});
					setNote({ text: t("emptied", { count: value.removed, bytes: fmtBytes(value.bytes) }), error: false });
				} catch (callError) {
					setNote({ text: String(callError.message || callError), error: true });
				}
				refresh();
			};

			var children = [h("h2", null, t("pageTitle")), h("p", { className: "dshm-intro", dir: "auto" }, t("pageIntro"))];

			var toolbar = h(
				"div",
				{ className: "dshm-toolbar" },
				h("button", { className: "dshm-btn", disabled: busy, onClick: refresh }, busy ? t("busy") : t("refresh")),
				data
					? h("span", { className: "dshm-totals" }, t("totals", { sessions: data.totals.sessions, bytes: fmtBytes(data.totals.bytes) }))
					: null,
			);
			children.push(toolbar);

			if (error !== null) {
				children.push(h("div", { className: "dshm-error" }, t("loadFailed") + "\n" + error));
				children.push(h("div", null, h("button", { className: "dshm-btn", onClick: refresh }, t("retry"))));
				return h("div", { className: "dshm-page" }, children);
			}

			if (data === null) {
				children.push(h("div", { className: "dshm-empty" }, t("loading")));
				return h("div", { className: "dshm-page" }, children);
			}

			if (note !== null) {
				children.push(h("div", { className: "dshm-note" + (note.error ? " is-error" : ""), dir: "auto" }, note.text));
			}

			if (data.problems && data.problems.length > 0) {
				children.push(h("div", { className: "dshm-problems", dir: "auto" }, data.problems.join("\n")));
			}

			// Trash section.
			var trashChildren = [];
			if (!data.trash || data.trash.length === 0) {
				trashChildren.push(h("div", { className: "dshm-empty" }, t("trashEmpty")));
			} else {
				data.trash.forEach(function (entry) {
					trashChildren.push(
						h(
							"div",
							{ className: "dshm-row", key: entry.entry },
							h(
								"div",
								{ className: "dshm-row-main" },
								h("div", { className: "dshm-row-title", dir: "auto" }, entry.sessionId || entry.entry),
								h("div", { className: "dshm-row-meta" }, fmtDate(entry.movedAt) + (entry.cwd ? " · " + entry.cwd : "")),
							),
							h("span", { className: "dshm-badge" }, fmtBytes(entry.bytes)),
							h(
								"button",
								{
									className: "dshm-btn",
									disabled: busy || !entry.hasManifest,
									onClick: function () {
										restore(entry.entry);
									},
								},
								t("restore"),
							),
						),
					);
				});
				trashChildren.push(
					h("div", { className: "dshm-card-head" },
						h("span", { className: "dshm-card-meta" }, t("trashBytes", { bytes: fmtBytes(data.totals.trashBytes) })),
						h("button", { className: "dshm-btn danger", disabled: busy, onClick: emptyTrash }, t("emptyTrash")),
					),
				);
			}
			children.push(
				h(
					"div",
					{ className: "dshm-card" },
					h("div", { className: "dshm-card-head" }, h("span", { className: "dshm-card-title" }, t("trashTitle", { count: data.trash ? data.trash.length : 0 }))),
					trashChildren,
				),
			);

			// Workspace groups.
			var selectedIds = Object.keys(selected);
			children.push(h("div", { className: "dshm-card-title" }, t("workspacesTitle")));
			data.workspaces.forEach(function (group) {
				children.push(h(GroupCard, {
					key: group.id,
					kind: "workspace",
					group: group,
					t: t,
					selected: selected,
					busy: busy,
					onToggle: toggleOne,
					onDeleteSessions: deleteSessions,
					onPurge: purgeWorkspace,
				}));
			});

			// Orphan cwd groups.
			if (data.orphans && data.orphans.length > 0) {
				children.push(h("div", { className: "dshm-card-title" }, t("orphansTitle")));
				data.orphans.forEach(function (group) {
					children.push(h(GroupCard, {
						key: group.path || "(none)",
						kind: "orphan",
						group: group,
						t: t,
						selected: selected,
						busy: busy,
						onToggle: toggleOne,
						onDeleteSessions: deleteSessions,
						onPurge: purgeWorkspace,
					}));
				});
			}

			// Bottom action bar.
			children.push(
				h(
					"div",
					{ className: "dshm-toolbar" },
					h(
						"button",
						{
							className: "dshm-btn danger",
							disabled: busy || selectedIds.length === 0,
							onClick: function () {
								deleteSessions(selectedIds);
							},
						},
						t("deleteSelected", { count: selectedIds.length }),
					),
				),
			);

			return h("div", { className: "dshm-page" }, children);
		}

		/* ------------------------------------------------------------------ */
		/* Plugin entry                                                        */
		/* ------------------------------------------------------------------ */

		exports.apply = function apply(ctx) {
			injectCss();
			var t = makeT(ctx);
			var slots = ctx.get("slots");
			if (slots === undefined) {
				console.error("[" + PACKAGE + "] slots service unavailable — UI contributions skipped");
				return;
			}

			ctx.effect(function () {
				return slots.inject("sidebar.workspaces.session.menu.item", function () {
					return slots.register(
						{
							name: "sidebar.workspaces.session.menu.item",
							id: "session-manager.delete",
							order: 500,
							label: function () {
								return t("menuDelete");
							},
						},
						function (props) {
							return h(DeleteRow, Object.assign({ t: t }, props));
						},
					);
				});
			}, PACKAGE + ": session menu row");

			ctx.effect(function () {
				return slots.inject("settings.section", function () {
					return slots.register(
						{
							name: "settings.section",
							id: "session-manager",
							order: 25,
							label: function () {
								return t("pageTitle");
							},
						},
						function (props) {
							return h(ManagerPage, Object.assign({ t: t }, props));
						},
					);
				});
			}, PACKAGE + ": settings page");

			try {
				console.log("[" + PACKAGE + "] active — session deletion is available in the sidebar menu and Settings");
			} catch (error) { /* best-effort */ }
		};

		return module.exports;
	},
});
