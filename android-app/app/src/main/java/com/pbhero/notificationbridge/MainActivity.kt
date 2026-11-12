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
import com.pbhero.notificationbridge.data.db.PaymentEventEntity
import com.pbhero.notificationbridge.network.WebhookClient
import com.pbhero.notificationbridge.network.WebhookDeliveryWorker
import com.pbhero.notificationbridge.service.PBHeroNotificationListener
import com.pbhero.notificationbridge.ui.theme.*
import kotlinx.coroutines.launch
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
    var eventsList by remember { mutableStateOf<List<PaymentEventEntity>>(emptyList()) }

    fun refreshState() {
        val packages = NotificationManagerCompat.getEnabledListenerPackages(context)
        hasNotifPermission = packages.contains(context.packageName)
        eventCounts = db.getCounts()
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
    connectionStatus: String,
    onGrantPermission: () -> Unit,
    onTestConnection: () -> Unit,
    onTestNotification: () -> Unit,
    onSyncNow: () -> Unit
) {
    val context = LocalContext.current
    val app = context.applicationContext as PBHeroApp
    val keystore = app.keystoreManager
    val dateFormat = SimpleDateFormat("dd MMM, HH:mm", Locale.getDefault())

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
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
                    StatusRow("Last Notification", if (keystore.lastReceivedTime > 0) dateFormat.format(Date(keystore.lastReceivedTime)) else "None")
                    StatusRow("Last Delivery", if (keystore.lastDeliveredTime > 0) dateFormat.format(Date(keystore.lastDeliveredTime)) else "None")
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
    val dateFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

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
                            Text("Payer: ${event.payerName ?: "Unknown"}", color = PbTextPrimary, fontSize = 12.sp)
                            Text("Time: ${dateFormat.format(Date(event.timestamp))} | Ref: ${event.refInfo ?: "N/A"}", color = PbTextSecondary, fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                        }
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 3: SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun SettingsScreen(keystore: com.pbhero.notificationbridge.data.security.KeystoreManager) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var urlInput by remember { mutableStateOf(keystore.serverUrl) }
    var registering by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("SETTINGS & SECURITY", color = PbCyan, fontWeight = FontWeight.Bold, fontSize = 14.sp)

        Card(
            colors = CardDefaults.cardColors(containerColor = PbSurface),
            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbBorder))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Cloud Server API Base URL", color = PbTextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = urlInput,
                    onValueChange = {
                        urlInput = it
                        keystore.serverUrl = it
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text("Example: https://pbhero.qzz.io or http://192.168.1.100:8000", color = PbTextSecondary, fontSize = 10.sp)
            }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = PbSurface),
            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(PbBorder))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Device Provisioning", color = PbTextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(8.dp))
                StatusRow("Device ID", keystore.deviceId)
                StatusRow("HMAC Key", keystore.secretKey.take(8) + "...")
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = {
                        scope.launch {
                            registering = true
                            val res = WebhookClient(keystore).registerDevice()
                            registering = false
                            val msg = if (res.isSuccess) "Registered with Cloud Server!" else "Registration failed: ${res.exceptionOrNull()?.message}"
                            Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                        }
                    },
                    enabled = !registering,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = PbCyan)
                ) {
                    Text(if (registering) "Registering..." else "Register Device with Cloud", color = PbBackground, fontWeight = FontWeight.Bold)
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

