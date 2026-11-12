package com.pbhero.notificationbridge

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.pbhero.notificationbridge.data.db.PaymentEventEntity
import com.pbhero.notificationbridge.network.WebhookClient
import com.pbhero.notificationbridge.network.WebhookDeliveryWorker
import com.pbhero.notificationbridge.service.PBHeroNotificationListener
import com.pbhero.notificationbridge.ui.theme.*
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PBHeroTheme {
                MainAppScreen()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainAppScreen() {
    val context = LocalContext.current
    val app = context.applicationContext as PBHeroApp
    val keystore = app.keystoreManager
    val db = app.database
    val scope = rememberCoroutineScope()

    var selectedTab by remember { mutableStateOf(0) }
    var hasNotifPermission by remember { mutableStateOf(false) }
    var connectionStatus by remember { mutableStateOf("Ready") }
    var eventCounts by remember { mutableStateOf(Triple(0, 0, 0)) }
    var trafficMetrics by remember { mutableStateOf(Triple(0, 0, 0)) }
    var eventsList by remember { mutableStateOf<List<PaymentEventEntity>>(emptyList()) }

    fun refreshState() {
        val packages = NotificationManagerCompat.getEnabledListenerPackages(context)
        hasNotifPermission = packages.contains(context.packageName)
        eventCounts = db.getCounts()
        trafficMetrics = db.getTrafficMetrics()
        eventsList = db.getAllEvents(30)
    }

    LaunchedEffect(Unit) {
        refreshState()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "PB HERO",
                            color = PbCyan,
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "BRIDGE",
                            color = PbPurple,
                            fontWeight = FontWeight.Black,
                            fontSize = 20.sp
                        )
                    }
                },
                actions = {
                    Box(
                        modifier = Modifier
                            .padding(end = 12.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (hasNotifPermission) PbSuccess.copy(alpha = 0.2f) else PbError.copy(alpha = 0.2f))
                            .border(1.dp, if (hasNotifPermission) PbSuccess else PbError, RoundedCornerShape(8.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            if (hasNotifPermission) "ACTIVE" else "PERMISSION NEEDED",
                            color = if (hasNotifPermission) PbSuccess else PbError,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = PbBackground)
            )
        },
        bottomBar = {
            NavigationBar(containerColor = PbSurface) {
                val navItems = listOf(
                    Triple("Dashboard", Icons.Default.Dashboard, 0),
                    Triple("Apps", Icons.Default.Apps, 1),
                    Triple("History", Icons.Default.History, 2),
                    Triple("Settings", Icons.Default.Settings, 3),
                    Triple("Guide", Icons.Default.HelpOutline, 4)
                )
                navItems.forEach { (label, icon, index) ->
                    NavigationBarItem(
                        selected = selectedTab == index,
                        onClick = {
                            selectedTab = index
                            refreshState()
                        },
                        icon = { Icon(icon, contentDescription = label) },
                        label = { Text(label, fontSize = 10.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = PbCyan,
                            selectedTextColor = PbCyan,
                            unselectedIconColor = PbTextSecondary,
                            unselectedTextColor = PbTextSecondary,
                            indicatorColor = PbCyan.copy(alpha = 0.15f)
                        )
                    )
                }
            }
        },
        containerColor = PbBackground
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            when (selectedTab) {
                0 -> DashboardScreen(
                    hasPermission = hasNotifPermission,
                    counts = eventCounts,
                    traffic = trafficMetrics,
                    connectionStatus = connectionStatus,
                    onGrantPermission = {
                        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                    },
                    onTestConnection = {
                        scope.launch {
                            connectionStatus = "Testing..."
                            val res = WebhookClient(keystore).testConnection()
                            connectionStatus = if (res.isSuccess) "Connected (200 OK)" else "Failed: ${res.exceptionOrNull()?.message}"
                            Toast.makeText(context, connectionStatus, Toast.LENGTH_SHORT).show()
                        }
                    },
                    onTestNotification = {
                        val testEvent = PaymentEventEntity(
                            eventId = "TEST-${System.currentTimeMillis()}",
                            packageName = "com.paytm.business",
                            title = "Payment Received",
                            text = "Payment received of ₹50.00 from Rahul Sharma",
                            amount = 50.0,
                            payerName = "Rahul Sharma",
                            refInfo = "123456789012",
                            timestamp = System.currentTimeMillis(),
                            status = "PENDING"
                        )
                        db.insertEvent(testEvent)
                        WorkManager.getInstance(context).enqueue(OneTimeWorkRequestBuilder<WebhookDeliveryWorker>().build())
                        refreshState()
                        Toast.makeText(context, "Test event enqueued for delivery!", Toast.LENGTH_SHORT).show()
                    },
                    onSyncNow = {
                        WorkManager.getInstance(context).enqueue(OneTimeWorkRequestBuilder<WebhookDeliveryWorker>().build())
                        refreshState()
                        Toast.makeText(context, "Sync enqueued!", Toast.LENGTH_SHORT).show()
                    },
                    onNavigateToSettings = {
                        selectedTab = 3
                    }
                )
                1 -> PackageSelectorScreen(keystore = keystore)
                2 -> HistoryScreen(events = eventsList, onRefresh = { refreshState() })
                3 -> SettingsScreen(keystore = keystore)
                4 -> OnboardingGuideScreen(
                    onOpenNotificationSettings = {
                        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                    },
                    onOpenBatterySettings = {
                        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                        context.startActivity(intent)
                    }
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 0: DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun DashboardScreen(
    hasPermission: Boolean,
    counts: Triple<Int, Int, Int>,
    traffic: Triple<Int, Int, Int>,
    connectionStatus: String,
    onGrantPermission: () -> Unit,
    onTestConnection: () -> Unit,
    onTestNotification: () -> Unit,
    onSyncNow: () -> Unit,
    onNavigateToSettings: () -> Unit
) {
    val context = LocalContext.current
    val app = context.applicationContext as PBHeroApp
    val keystore = app.keystoreManager
    val dateFormat = SimpleDateFormat("dd MMM, HH:mm", Locale.getDefault())
    val fullDateFormat = SimpleDateFormat("dd MMM, hh:mm:ss a", Locale.getDefault())

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (!keystore.isPaired) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = PbWarning.copy(alpha = 0.15f)),
                    border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbWarning))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = PbWarning)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Device Not Paired to Dashboard", color = PbWarning, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            "Scan the Pairing QR Code on your PB HERO Dashboard (Settings > App Download & Security) to activate live donation syncing.",
                            color = PbTextSecondary,
                            fontSize = 12.sp
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Button(
                            onClick = onNavigateToSettings,
                            colors = ButtonDefaults.buttonColors(containerColor = PbWarning)
                        ) {
                            Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = PbBackground)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Scan Dashboard QR Code", color = PbBackground, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
        if (!hasPermission) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = PbError.copy(alpha = 0.15f)),
                    border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbError))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Warning, contentDescription = null, tint = PbError)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Notification Access Required", color = PbError, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Android requires explicit permission for PB HERO to read Paytm Business payment notifications.",
                            color = PbTextSecondary,
                            fontSize = 12.sp
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = onGrantPermission,
                            colors = ButtonDefaults.buttonColors(containerColor = PbError)
                        ) {
                            Text("Enable in System Settings", color = PbBackground, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Section: Notification Traffic & Frequency Metrics
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = PbSurfaceVariant),
                border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbCyan))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Speed, contentDescription = null, tint = PbCyan, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("NOTIFICATION TRAFFIC & TIMING", color = PbCyan, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(if (keystore.isAutoDismissEnabled) PbSuccess.copy(alpha = 0.2f) else PbWarning.copy(alpha = 0.2f))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                if (keystore.isAutoDismissEnabled) "AUTO-CLEAR ON" else "AUTO-CLEAR OFF",
                                color = if (keystore.isAutoDismissEnabled) PbSuccess else PbWarning,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        CountCard("Today", traffic.first, PbCyan, Modifier.weight(1f))
                        CountCard("Past 1h", traffic.second, PbPurple, Modifier.weight(1f))
                        CountCard("Past 24h", traffic.third, PbTextPrimary, Modifier.weight(1f))
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    StatusRow(
                        "Last Received",
                        if (keystore.lastReceivedTime > 0)
                            "${fullDateFormat.format(Date(keystore.lastReceivedTime))} (${formatRelativeTime(keystore.lastReceivedTime)})"
                        else "No notifications yet"
                    )
                    StatusRow("Auto-Dismiss Shade", if (keystore.isAutoDismissEnabled) "Active (Clears Notification Drawer)" else "Disabled")
                    StatusRow("Duplicate Guard", "Active (Prevents Re-reading Same Payment)")
                    StatusRow("Stale Time Filter", if (keystore.isFilterStaleEnabled) "Active (Discards >10m Old Alerts)" else "Disabled")
                }
            }
        }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = PbSurface),
                border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbBorder))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("SYSTEM STATUS", color = PbTextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(12.dp))

                    StatusRow("Device ID", keystore.deviceId)
                    StatusRow("Cloud Server", keystore.serverUrl)
                    StatusRow("Connection", connectionStatus)
                    StatusRow("Allowed Apps", "${keystore.allowedPackages.size} app(s) whitelisted")
                    StatusRow("Last Notification", if (keystore.lastReceivedTime > 0) "${dateFormat.format(Date(keystore.lastReceivedTime))} (${formatRelativeTime(keystore.lastReceivedTime)})" else "None")
                    StatusRow("Last Delivery", if (keystore.lastDeliveredTime > 0) "${dateFormat.format(Date(keystore.lastDeliveredTime))} (${formatRelativeTime(keystore.lastDeliveredTime)})" else "None")
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CountCard("Pending", counts.first, PbWarning, Modifier.weight(1f))
                CountCard("Delivered", counts.second, PbSuccess, Modifier.weight(1f))
                CountCard("Failed", counts.third, PbError, Modifier.weight(1f))
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = onTestConnection,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = PbSurfaceVariant)
                ) {
                    Icon(Icons.Default.CloudSync, contentDescription = null, tint = PbCyan)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Test Server Connection", color = PbTextPrimary)
                }

                Button(
                    onClick = onTestNotification,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = PbCyan)
                ) {
                    Icon(Icons.Default.NotificationsActive, contentDescription = null, tint = PbBackground)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Simulate ₹50 Test Alert", color = PbBackground, fontWeight = FontWeight.Bold)
                }

                OutlinedButton(
                    onClick = onSyncNow,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Sync, contentDescription = null, tint = PbTextPrimary)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Sync Queue Now", color = PbTextPrimary)
                }
            }
        }
    }
}

@Composable
fun StatusRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, color = PbTextSecondary, fontSize = 12.sp)
        Text(value, color = PbTextPrimary, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
    }
}

@Composable
fun CountCard(label: String, count: Int, color: androidx.compose.ui.graphics.Color, modifier: Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = PbSurface),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbBorder))
    ) {
        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, color = PbTextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            Spacer(modifier = Modifier.height(4.dp))
            Text(count.toString(), color = color, fontSize = 24.sp, fontWeight = FontWeight.Black)
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 1: PACKAGE SELECTOR
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun PackageSelectorScreen(keystore: com.pbhero.notificationbridge.data.security.KeystoreManager) {
    val context = LocalContext.current
    var installedApps by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var searchQuery by remember { mutableStateOf("") }
    var allowedSet by remember { mutableStateOf(keystore.allowedPackages) }

    LaunchedEffect(Unit) {
        val pm = context.packageManager
        val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            .map { appInfo ->
                val label = pm.getApplicationLabel(appInfo).toString()
                val pkg = appInfo.packageName
                Pair(label, pkg)
            }
            .sortedBy { it.first.lowercase() }
        installedApps = apps
    }

    val filtered = installedApps.filter {
        it.first.contains(searchQuery, ignoreCase = true) || it.second.contains(searchQuery, ignoreCase = true)
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("SELECT NOTIFICATION SOURCES", color = PbCyan, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        Spacer(modifier = Modifier.height(4.dp))
        Text("Only notifications from whitelisted apps are read and forwarded.", color = PbTextSecondary, fontSize = 11.sp)
        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Search installed apps (e.g. paytm)...", color = PbTextSecondary) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Suggested Candidate Shortcut
        val candidate = "com.paytm.business"
        Card(
            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
            colors = CardDefaults.cardColors(containerColor = PbSurfaceVariant),
            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbCyan))
        ) {
            Row(
                modifier = Modifier.padding(12.dp).fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("Paytm for Business (Candidate)", color = PbCyan, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Text(candidate, color = PbTextSecondary, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                }
                Checkbox(
                    checked = allowedSet.contains(candidate),
                    onCheckedChange = { checked ->
                        keystore.togglePackage(candidate, checked)
                        allowedSet = keystore.allowedPackages
                    }
                )
            }
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filtered) { (label, pkg) ->
                val isChecked = allowedSet.contains(pkg)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isChecked) PbCyan.copy(alpha = 0.08f) else PbSurface)
                        .border(1.dp, if (isChecked) PbCyan.copy(alpha = 0.4f) else PbBorder, RoundedCornerShape(8.dp))
                        .clickable {
                            keystore.togglePackage(pkg, !isChecked)
                            allowedSet = keystore.allowedPackages
                        }
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(label, color = PbTextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        Text(pkg, color = PbTextSecondary, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    }
                    Checkbox(
                        checked = isChecked,
                        onCheckedChange = {
                            keystore.togglePackage(pkg, it)
                            allowedSet = keystore.allowedPackages
                        }
                    )
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 2: HISTORY
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun HistoryScreen(events: List<PaymentEventEntity>, onRefresh: () -> Unit) {
    val fullDateFormat = SimpleDateFormat("dd MMM, hh:mm:ss a", Locale.getDefault())

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("EVENT HISTORY", color = PbCyan, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            IconButton(onClick = onRefresh) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = PbCyan)
            }
        }

        if (events.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No payment events captured yet.", color = PbTextSecondary, fontSize = 12.sp)
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(events) { event ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = PbSurface),
                        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbBorder))
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("₹${event.amount}", color = PbSuccess, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(
                                            when (event.status) {
                                                "DELIVERED" -> PbSuccess.copy(alpha = 0.2f)
                                                "PENDING" -> PbWarning.copy(alpha = 0.2f)
                                                else -> PbError.copy(alpha = 0.2f)
                                            }
                                        )
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        event.status,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = when (event.status) {
                                            "DELIVERED" -> PbSuccess
                                            "PENDING" -> PbWarning
                                            else -> PbError
                                        }
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("Payer: ${event.payerName ?: "Unknown"}", color = PbTextPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                "Captured: ${fullDateFormat.format(Date(event.timestamp))} (${formatRelativeTime(event.timestamp)})",
                                color = PbCyan,
                                fontSize = 11.sp
                            )
                            if (!event.refInfo.isNullOrBlank()) {
                                Spacer(modifier = Modifier.height(2.dp))
                                Text("Ref / UTR: ${event.refInfo}", color = PbTextSecondary, fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 3: SETTINGS & PAIRING
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun SettingsScreen(keystore: com.pbhero.notificationbridge.data.security.KeystoreManager) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var urlInput by remember { mutableStateOf(keystore.serverUrl) }
    var pairingCodeInput by remember { mutableStateOf("") }
    var isPairing by remember { mutableStateOf(false) }
    var isHeartbeating by remember { mutableStateOf(false) }
    var isPairedState by remember { mutableStateOf(keystore.isPaired) }
    var showManualMode by remember { mutableStateOf(false) }

    val scanLauncher = rememberLauncherForActivityResult(
        contract = ScanContract()
    ) { result ->
        val scanned = result.contents
        if (!scanned.isNullOrBlank()) {
            try {
                var targetUrl = urlInput.ifBlank { "https://pbhero.qzz.io" }
                var targetCode = ""

                val trimmed = scanned.trim()
                if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                    val json = JSONObject(trimmed)
                    if (json.has("pairing_code")) {
                        targetCode = json.getString("pairing_code")
                    }
                    if (json.has("server_url")) {
                        targetUrl = json.getString("server_url").trim().removeSuffix("/")
                    }
                } else if (trimmed.matches(Regex("^\\d{6}$"))) {
                    targetCode = trimmed
                } else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                    val uri = Uri.parse(trimmed)
                    val codeParam = uri.getQueryParameter("code") ?: uri.getQueryParameter("pairing_code")
                    if (!codeParam.isNullOrBlank()) {
                        targetCode = codeParam
                        targetUrl = "${uri.scheme}://${uri.authority}"
                    }
                }

                if (targetCode.length == 6) {
                    urlInput = targetUrl
                    pairingCodeInput = targetCode
                    scope.launch {
                        isPairing = true
                        val res = WebhookClient(keystore).pairWithCode(targetUrl, targetCode)
                        isPairing = false
                        if (res.isSuccess) {
                            isPairedState = true
                            pairingCodeInput = ""
                            Toast.makeText(context, "Connected & Paired with Dashboard Successfully!", Toast.LENGTH_LONG).show()
                        } else {
                            Toast.makeText(context, "Pairing Failed: ${res.exceptionOrNull()?.message}", Toast.LENGTH_LONG).show()
                        }
                    }
                } else {
                    Toast.makeText(context, "Could not detect a 6-digit code in QR. Please try again.", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Scan error: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    fun launchQrScanner() {
        val options = ScanOptions().apply {
            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            setPrompt("Scan Pairing QR from Dashboard (Settings > App Download & Security)")
            setBeepEnabled(true)
            setOrientationLocked(false)
        }
        scanLauncher.launch(options)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text("SETTINGS & SECURITY PAIRING", color = PbCyan, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }

        // Section 1: Instant 1-Tap QR Pairing (Zero Manual Typing)
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = PbSurfaceVariant),
                border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(if (isPairedState) PbSuccess else PbCyan))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = PbCyan)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("1-Tap Dashboard QR Pairing", color = PbCyan, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(if (isPairedState) PbSuccess.copy(alpha = 0.2f) else PbWarning.copy(alpha = 0.2f))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                if (isPairedState) "PAIRED & ACTIVE" else "NOT PAIRED",
                                color = if (isPairedState) PbSuccess else PbWarning,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        "No manual Cloud Secret Key or URL typing required! Tap below to scan the Pairing QR code on your PB HERO Dashboard. Encryption keys are generated and saved securely in your phone's Keystore.",
                        color = PbTextSecondary,
                        fontSize = 12.sp,
                        lineHeight = 16.sp
                    )

                    Spacer(modifier = Modifier.height(14.dp))
                    Button(
                        onClick = { launchQrScanner() },
                        enabled = !isPairing,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PbCyan),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = PbBackground)
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            if (isPairing) "Pairing in progress..." else "SCAN DASHBOARD QR CODE",
                            color = PbBackground,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                    }

                    if (isPairedState) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = PbSuccess, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Paired to: ${keystore.serverUrl}", color = PbSuccess, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                        }
                    }
                }
            }
        }

        // Section 2: Manual 6-Digit Pairing Fallback
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = PbSurface),
                border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbBorder))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showManualMode = !showManualMode },
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Keyboard, contentDescription = null, tint = PbTextSecondary, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Manual Pairing Fallback", color = PbTextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                        }
                        Icon(
                            if (showManualMode) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = null,
                            tint = PbTextSecondary
                        )
                    }

                    if (showManualMode) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Dashboard / Cloud Server URL", color = PbTextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(4.dp))
                        OutlinedTextField(
                            value = urlInput,
                            onValueChange = {
                                urlInput = it
                                keystore.serverUrl = it
                            },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )

                        Spacer(modifier = Modifier.height(10.dp))
                        Text("6-Digit Pairing Code", color = PbTextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(4.dp))
                        OutlinedTextField(
                            value = pairingCodeInput,
                            onValueChange = { if (it.length <= 6) pairingCodeInput = it },
                            placeholder = { Text("e.g. 716950", color = PbTextSecondary) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )

                        Spacer(modifier = Modifier.height(14.dp))
                        Button(
                            onClick = {
                                if (pairingCodeInput.trim().length != 6) {
                                    Toast.makeText(context, "Please enter a valid 6-digit code", Toast.LENGTH_SHORT).show()
                                    return@Button
                                }
                                scope.launch {
                                    isPairing = true
                                    val res = WebhookClient(keystore).pairWithCode(urlInput, pairingCodeInput)
                                    isPairing = false
                                    if (res.isSuccess) {
                                        isPairedState = true
                                        pairingCodeInput = ""
                                        Toast.makeText(context, "Device Paired Successfully!", Toast.LENGTH_LONG).show()
                                    } else {
                                        Toast.makeText(context, "Pairing Failed: ${res.exceptionOrNull()?.message}", Toast.LENGTH_LONG).show()
                                    }
                                }
                            },
                            enabled = !isPairing,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = PbSurfaceVariant)
                        ) {
                            Text(if (isPairing) "Pairing..." else "Pair with 6-Digit Code", color = PbCyan, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Section: Notification Dismissal & Timing Settings
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = PbSurface),
                border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbBorder))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.NotificationsActive, contentDescription = null, tint = PbCyan, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("NOTIFICATION AUTO-DISMISS & TIMING", color = PbCyan, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.height(14.dp))

                    var autoDismiss by remember { mutableStateOf(keystore.isAutoDismissEnabled) }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Auto-Clear Status Bar Notifications", color = PbTextPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(modifier = Modifier.height(2.dp))
                            Text("Swipes away Paytm notification once captured to prevent repeated capture or duplicate donations.", color = PbTextSecondary, fontSize = 11.sp)
                        }
                        Switch(
                            checked = autoDismiss,
                            onCheckedChange = {
                                autoDismiss = it
                                keystore.isAutoDismissEnabled = it
                            }
                        )
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    var filterStale by remember { mutableStateOf(keystore.isFilterStaleEnabled) }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Ignore Stale Notifications (> 10 mins)", color = PbTextPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(modifier = Modifier.height(2.dp))
                            Text("Discards historical notifications already in drawer when phone boots or reconnects.", color = PbTextSecondary, fontSize = 11.sp)
                        }
                        Switch(
                            checked = filterStale,
                            onCheckedChange = {
                                filterStale = it
                                keystore.isFilterStaleEnabled = it
                            }
                        )
                    }
                }
            }
        }

        // Section: Device Provisioning Details & Diagnostic Buttons
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = PbSurface),
                border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbBorder))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Device Credentials & Heartbeat", color = PbTextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))
                    StatusRow("Device ID", keystore.deviceId)
                    StatusRow("App Version", "1.0.1")
                    StatusRow("HMAC Key", keystore.secretKey.take(8) + "...")
                    Spacer(modifier = Modifier.height(12.dp))

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                scope.launch {
                                    isHeartbeating = true
                                    val res = WebhookClient(keystore).sendHeartbeat()
                                    isHeartbeating = false
                                    Toast.makeText(context, if (res.isSuccess) "Heartbeat Successful!" else "Heartbeat Failed: ${res.exceptionOrNull()?.message}", Toast.LENGTH_SHORT).show()
                                }
                            },
                            enabled = !isHeartbeating,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = PbSurfaceVariant)
                        ) {
                            Text(if (isHeartbeating) "Sending..." else "Send Heartbeat", color = PbCyan, fontSize = 11.sp)
                        }

                        Button(
                            onClick = {
                                scope.launch {
                                    val res = WebhookClient(keystore).testConnection()
                                    Toast.makeText(context, if (res.isSuccess) "Connected to server!" else "Connection failed: ${res.exceptionOrNull()?.message}", Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = PbSurfaceVariant)
                        ) {
                            Text("Test Health", color = PbCyan, fontSize = 11.sp)
                        }
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 4: ONBOARDING & BATTERY GUIDE
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun OnboardingGuideScreen(
    onOpenNotificationSettings: () -> Unit,
    onOpenBatterySettings: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text("ONBOARDING & SETUP GUIDE", color = PbCyan, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Spacer(modifier = Modifier.height(4.dp))
            Text("Follow these 3 quick steps to ensure 24/7 uninterrupted donation forwarding.", color = PbTextSecondary, fontSize = 12.sp)
        }

        item {
            StepCard(
                step = "1",
                title = "Grant Notification Access",
                description = "Android requires explicit permission for PB HERO to read Paytm Business payment notifications. Tap below, find 'PB HERO Bridge', and toggle it ON.",
                buttonText = "Open Notification Access Settings",
                onAction = onOpenNotificationSettings
            )
        }

        item {
            StepCard(
                step = "2",
                title = "Disable Battery Optimization",
                description = "Android's aggressive battery manager may kill background services when the phone is locked. Set PB HERO to 'Unrestricted' or 'Do Not Optimize'.",
                buttonText = "Open Battery Optimization Settings",
                onAction = onOpenBatterySettings
            )
        }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = PbSurface),
                border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbBorder))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Step 3: Whitelist Paytm for Business", color = PbCyan, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        "Go to the 'Apps' tab and verify that 'com.paytm.business' is checked. Only whitelisted apps will be processed. Your private personal notifications (WhatsApp, SMS, etc.) will never be touched.",
                        color = PbTextSecondary,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
fun StepCard(step: String, title: String, description: String, buttonText: String, onAction: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = PbSurface),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbBorder))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(PbCyan),
                    contentAlignment = Alignment.Center
                ) {
                    Text(step, color = PbBackground, fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.width(10.dp))
                Text(title, color = PbTextPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(description, color = PbTextSecondary, fontSize = 12.sp)
            Spacer(modifier = Modifier.height(12.dp))
            Button(
                onClick = onAction,
                colors = ButtonDefaults.buttonColors(containerColor = PbSurfaceVariant)
            ) {
                Text(buttonText, color = PbCyan, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

fun formatRelativeTime(timestamp: Long): String {
    if (timestamp <= 0) return "None"
    val diff = System.currentTimeMillis() - timestamp
    if (diff < 5000) return "Just now"
    val seconds = diff / 1000
    if (seconds < 60) return "${seconds}s ago"
    val minutes = seconds / 60
    if (minutes < 60) return "${minutes}m ago"
    val hours = minutes / 60
    if (hours < 24) return "${hours}h ago"
    val days = hours / 24
    return "${days}d ago"
}


