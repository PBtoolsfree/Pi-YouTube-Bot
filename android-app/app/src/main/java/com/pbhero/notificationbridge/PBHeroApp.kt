package com.pbhero.notificationbridge

import android.app.Application
import com.pbhero.notificationbridge.data.db.PaymentEventDatabase
import com.pbhero.notificationbridge.data.security.KeystoreManager

class PBHeroApp : Application() {
    companion object {
        lateinit var instance: PBHeroApp
            private set
    }

    lateinit var database: PaymentEventDatabase
        private set

    lateinit var keystoreManager: KeystoreManager
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        database = PaymentEventDatabase(this)
        keystoreManager = KeystoreManager(this)
    }
}

