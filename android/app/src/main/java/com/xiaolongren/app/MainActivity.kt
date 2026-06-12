package com.xiaolongren.app

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    companion object {
        private const val PREFS_NAME = "xiaolongren_prefs"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_API_KEY = "api_key"
        private const val KEY_CONFIGURED = "configured"
        private const val DEFAULT_SERVER_URL = "http://192.168.1.35:8089"
    }

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var configView: View
    private lateinit var webViewContainer: View
    private lateinit var prefs: SharedPreferences
    private var currentUrl: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // 根布局
        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // ===== 配置页面（首次启动/手动打开设置） =====
        configView = createConfigView()
        configView.visibility = View.GONE
        rootLayout.addView(configView)

        // ===== WebView容器（聊天页面） =====
        webViewContainer = createWebViewContainer()
        webViewContainer.visibility = View.GONE
        rootLayout.addView(webViewContainer)

        setContentView(rootLayout)

        // 判断是否已配置
        if (prefs.getBoolean(KEY_CONFIGURED, false)) {
            showWebView()
        } else {
            showConfig()
        }
    }

    // ===== 配置页面 =====
    private fun createConfigView(): View {
        val scrollView = ScrollView(this)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setPadding(32, 48, 32, 48)
        }

        // 标题
        container.addView(TextView(this).apply {
            text = "小龙人 · 连接设置"
            textSize = 24f
            setPadding(0, 0, 0, 16)
        })

        container.addView(TextView(this).apply {
            text = "请在下方输入你的小龙人服务器地址和API密钥"
            textSize = 14f
            setPadding(0, 0, 0, 32)
            alpha = 0.7f
        })

        // 服务器地址
        container.addView(TextView(this).apply {
            text = "服务器地址"
            textSize = 16f
            setPadding(0, 0, 0, 4)
        })
        val serverUrlInput = EditText(this).apply {
            hint = "http://你的IP或域名:端口"
            setText(prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL))
            setPadding(16, 12, 16, 12)
            setBackgroundResource(android.R.drawable.editbox_background)
            setPadding(0, 0, 0, 24)
        }
        container.addView(serverUrlInput)

        // API Key
        container.addView(TextView(this).apply {
            text = "API密钥（API Key）"
            textSize = 16f
            setPadding(0, 0, 0, 4)
        })
        val apiKeyInput = EditText(this).apply {
            hint = "sk-xxxxxxxxxxxxxxxx"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                    android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setText(prefs.getString(KEY_API_KEY, ""))
            setPadding(16, 12, 16, 12)
            setBackgroundResource(android.R.drawable.editbox_background)
            setPadding(0, 0, 0, 24)
        }
        container.addView(apiKeyInput)

        // 提示文字
        container.addView(TextView(this).apply {
            text = "不知道地址和密钥？请咨询你的小龙人服务提供者。\n配置后可以随时在右上角菜单重新设置。"
            textSize = 12f
            setPadding(0, 0, 0, 24)
            alpha = 0.6f
        })

        // 连接按钮
        val connectBtn = Button(this).apply {
            text = "连接小龙人"
            setPadding(0, 16, 0, 16)
            setOnClickListener {
                val url = serverUrlInput.text.toString().trim()
                val key = apiKeyInput.text.toString().trim()

                if (url.isEmpty()) {
                    Toast.makeText(this@MainActivity, "请输入服务器地址", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }

                // 保存配置
                prefs.edit()
                    .putString(KEY_SERVER_URL, url)
                    .putString(KEY_API_KEY, key)
                    .putBoolean(KEY_CONFIGURED, true)
                    .apply()

                showWebView()
            }
        }
        container.addView(connectBtn)

        scrollView.addView(container)
        return scrollView
    }

    // ===== WebView容器 =====
    private fun createWebViewContainer(): View {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // 顶部工具栏
        val toolbar = createToolbar()
        container.addView(toolbar)

        // 下拉刷新 + WebView
        swipeRefresh = SwipeRefreshLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0
            )
            layoutParams.height = 0
            (layoutParams as LinearLayout.LayoutParams).weight = 1f

            webView = WebView(this@MainActivity).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                setupWebView()
            }
            addView(webView)

            setOnRefreshListener {
                webView.reload()
            }
        }
        container.addView(swipeRefresh)

        // 底部导航
        container.addView(createBottomBar())

        return container
    }

    // ===== 顶部工具栏 =====
    private fun createToolbar(): View {
        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                48
            )
            setPadding(16, 0, 16, 0)
            setBackgroundColor(0xFF1565C0.toInt())
        }

        // 标题
        toolbar.addView(TextView(this).apply {
            text = "小龙人"
            textSize = 18f
            setTextColor(0xFFFFFFFF.toInt())
            layoutParams = LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f
            )
            gravity = android.view.Gravity.CENTER_VERTICAL
        })

        // 设置按钮
        toolbar.addView(ImageView(this).apply {
            layoutParams = ViewGroup.LayoutParams(48, 48)
            setPadding(8, 8, 8, 8)
            setOnClickListener {
                showConfig()
            }
        }.also {
            // 用文本代替图标
            removeView(it)
        })

        // 用TextView代替图标
        toolbar.addView(TextView(this).apply {
            text = "⚙"
            textSize = 22f
            setTextColor(0xFFFFFFFF.toInt())
            setPadding(8, 8, 8, 8)
            setOnClickListener {
                // 打开设置页面
                Toast.makeText(this@MainActivity, "已断开连接，请重新配置", Toast.LENGTH_SHORT).show()
                prefs.edit().putBoolean(KEY_CONFIGURED, false).apply()
                showConfig()
            }
        })

        return toolbar
    }

    // ===== 底部导航 =====
    private fun createBottomBar(): View {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                48
            )
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(0xFFF5F5F5.toInt())
        }

        // 后退
        bar.addView(createNavButton("← 后退") { if (webView.canGoBack()) webView.goBack() })
        // 前进
        bar.addView(createNavButton("前进 →") { if (webView.canGoForward()) webView.goForward() })
        // 刷新
        bar.addView(createNavButton("刷新") { webView.reload() })
        // 首页
        bar.addView(createNavButton("首页") { loadTargetUrl() })

        return bar
    }

    private fun createNavButton(text: String, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = 14f
            setPadding(16, 8, 16, 8)
            gravity = android.view.Gravity.CENTER
            setOnClickListener { onClick() }
        }
    }

    // ===== WebView配置 =====
    private fun WebView.setupWebView() {
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = false
            displayZoomControls = false
            setSupportZoom(true)
            allowFileAccess = false
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

            // 用户代理
            userAgentString = settings.userAgentString + " XiaoLongRen-Android"
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(this@setupWebView)
        }

        webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                swipeRefresh.isRefreshing = true
                currentUrl = url ?: ""
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefresh.isRefreshing = false
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                swipeRefresh.isRefreshing = false
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                return false
            }
        }

        webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress >= 100) {
                    swipeRefresh.isRefreshing = false
                }
            }
        }
    }

    // ===== 加载目标地址 =====
    private fun loadTargetUrl() {
        val serverUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL)
        val apiKey = prefs.getString(KEY_API_KEY, "")
        val baseUrl = serverUrl?.trimEnd('/') ?: DEFAULT_SERVER_URL

        // 加载小龙人前端页面，注入API Key
        val targetUrl = "$baseUrl/mobile.html"
        val headers = HashMap<String, String>()
        if (!apiKey.isNullOrEmpty()) {
            headers["Authorization"] = "Bearer $apiKey"
        }

        // 先加载页面，然后通过JS注入API Key到localStorage
        webView.loadUrl(targetUrl, headers)

        // 页面加载后把API Key写入localStorage
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (!apiKey.isNullOrEmpty()) {
                    view?.evaluateJavascript(
                        "localStorage.setItem('apiKey', '$apiKey');" +
                        "localStorage.setItem('serverUrl', '$baseUrl');", null
                    )
                }
                swipeRefresh.isRefreshing = false
            }
        }
    }

    // ===== 切换视图 =====
    private fun showWebView() {
        configView.visibility = View.GONE
        webViewContainer.visibility = View.VISIBLE
        loadTargetUrl()
    }

    private fun showConfig() {
        configView.visibility = View.VISIBLE
        webViewContainer.visibility = View.GONE
    }

    override fun onBackPressed() {
        if (webViewContainer.visibility == View.VISIBLE && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
